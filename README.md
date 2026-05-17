# MusicBot

Song request bot for streamers. Manages a real-time queue, downloads audio with yt-dlp, integrates with TikTok Live, Twitch and Kick, and exposes overlays for OBS.

**Stack:** ASP.NET Core 9 + WPF (Desktop shell) + React 19 + TypeScript + SQLite + SignalR + NAudio

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Development Commands](#development-commands)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Backend — Services](#backend--services)
- [Backend — API Reference](#backend--api-reference)
- [Frontend — Components](#frontend--components)
- [Database](#database)
- [Real-time (SignalR)](#real-time-signalr)
- [Relay OAuth](#relay-oauth)
- [Build and Distribution](#build-and-distribution)

---

## Prerequisites

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| [.NET SDK](https://dotnet.microsoft.com/download) | 9.0 | Build and run the backend/desktop |
| [Node.js](https://nodejs.org) | 20 LTS | Build the React frontend |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | latest | Download audio from YouTube (must be on PATH or set via `MusicLibrary:YtDlpPath`) |
| Windows 10/11 x86-64 | — | WPF + WebView2 + WASAPI only work on Windows |

> **WebView2** is included with Windows 11 and installs automatically on Windows 10 if not already present.

---

## Initial Setup

### 1. Clone the repository

```bash
git clone https://github.com/CLOSQTRS/MusicBot-EN.git
cd MusicBot
```

### 2. Platform credentials (user secrets)

**Never** put credentials in `appsettings.json`. Use the .NET user secrets manager:

```bash
# Spotify — https://developer.spotify.com/dashboard
dotnet user-secrets set "Spotify:ClientId"     "YOUR_CLIENT_ID"     --project src/MusicBot.Web
dotnet user-secrets set "Spotify:ClientSecret" "YOUR_CLIENT_SECRET" --project src/MusicBot.Web

# Twitch — https://dev.twitch.tv/console/apps
dotnet user-secrets set "Twitch:ClientId"     "YOUR_CLIENT_ID"     --project src/MusicBot.Web
dotnet user-secrets set "Twitch:ClientSecret" "YOUR_CLIENT_SECRET" --project src/MusicBot.Web

# Kick — https://kick.com/settings/developer
dotnet user-secrets set "Kick:ClientId"     "YOUR_CLIENT_ID"     --project src/MusicBot.Web
dotnet user-secrets set "Kick:ClientSecret" "YOUR_CLIENT_SECRET" --project src/MusicBot.Web

# Relay OAuth (see Relay OAuth section)
dotnet user-secrets set "Relay:Url"    "https://your-relay.workers.dev" --project src/MusicBot.Web
dotnet user-secrets set "Relay:ApiKey" "YOUR_RELAY_API_KEY"             --project src/MusicBot.Web
```

### 3. Install frontend dependencies

```bash
cd src/MusicBot.Web/clientapp
npm install
```

---

## Development Commands

```bash
# Run the full app (WPF + API + compiled React)
dotnet run --project src/MusicBot.Desktop

# Build the full solution (also compiles the frontend automatically)
dotnet build MusicBot.sln

# Frontend in dev mode with hot-reload (requires the backend to be running)
cd src/MusicBot.Web/clientapp
npm start                   # http://localhost:5173 — proxied to http://127.0.0.1:3050

# Build the frontend only
npm run build               # output to src/MusicBot.Web/wwwroot

# Frontend tests
npm test
```

> When running `dotnet build`, the MSBuild target in the csproj executes `npm install && npm run build` automatically, copying the output to `wwwroot`.

### Development URLs

| URL | What it is |
|-----|-----------|
| `http://127.0.0.1:3050` | API and SPA in production mode (inside the Desktop) |
| `http://localhost:5173` | Vite dev server with hot-reload |
| `http://127.0.0.1:3050/scalar/v1` | Interactive API docs (Scalar UI) |
| `http://127.0.0.1:3050/openapi/v1.json` | OpenAPI spec JSON |
| `http://127.0.0.1:3050/hub/overlay` | SignalR WebSocket for overlays |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MusicBot.Desktop  (WPF + WebView2)                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  MusicBot.Web  (ASP.NET Core 9 — Kestrel)           │    │
│  │  ┌──────────────┐  ┌──────────┐  ┌───────────────┐  │    │
│  │  │  Controllers │  │ Services │  │  SignalR Hub  │  │    │
│  │  └──────┬───────┘  └────┬─────┘  └───────┬───────┘  │    │
│  │         │               │                │           │    │
│  │  ┌──────▼───────────────▼────────────────▼───────┐  │    │
│  │  │           MusicBot.Core                       │  │    │
│  │  │  IQueueService · ISpotifyService · IChatAdapter│  │    │
│  │  └───────────────────────────────────────────────┘  │    │
│  │                         │                           │    │
│  │  ┌──────────────────────▼───────────────────────┐  │    │
│  │  │  SQLite (EF Core) · wwwroot (React SPA)      │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
         │                                   │
         ▼                                   ▼
  Browser/OBS Overlay              Cloudflare Worker
  (SignalR client)                 (OAuth Relay)
```

### Key principle: per-user isolation

Each registered user has their own set of services:

```
UserContextManager (singleton)
  └── ConcurrentDictionary<Guid, UserServices>
        └── UserServices
              ├── IQueueService    (in-memory queue)
              └── ISpotifyService  (Spotify OAuth connection)
```

Controllers resolve the user from the JWT/API key and call `UserContextManager.GetOrCreate(userId)`.

### Song request flow

```
Chat (TikTok/Twitch/Kick/Web)
  → IChatAdapter.OnCommandReceived()
  → CommandRouterService.HandleAsync(BotCommand)
  → IQueueService.Enqueue(song)
  → YtDlpDownloaderService (background download)
  → PlaybackSyncService (detects queue advance)
  → LocalPlayerService (plays via NAudio/WASAPI)
  → SignalRBroadcastService → OverlayHub → OBS Overlays
```

---

## Project Structure

```
MusicBot/
├── src/
│   ├── MusicBot.Core/              # Pure domain — no external dependencies
│   │   ├── Interfaces/
│   │   │   ├── IChatAdapter.cs
│   │   │   ├── ILocalLibraryService.cs
│   │   │   ├── ILocalPlayerService.cs
│   │   │   ├── IMetadataService.cs
│   │   │   ├── IQueueService.cs
│   │   │   └── ISpotifyService.cs
│   │   ├── Models/
│   │   │   ├── Song.cs             # Base entity: uri, title, artist, coverUrl, durationMs
│   │   │   ├── QueueItem.cs        # Song + requestedBy + platform + addedAt
│   │   │   ├── QueueState.cs       # nowPlaying + upcoming[]
│   │   │   ├── AppUser.cs          # Registered user
│   │   │   ├── BotCommand.cs       # Chat command (play/skip/bump...)
│   │   │   ├── CommandResult.cs    # Command result
│   │   │   ├── CachedTrack.cs      # Track downloaded to disk
│   │   │   ├── PlayedSong.cs       # Playback history
│   │   │   ├── AutoQueueSong.cs    # Auto-queue pool
│   │   │   ├── PersistedQueueItem.cs
│   │   │   ├── SpotifyToken.cs
│   │   │   └── UserApiKey.cs
│   │   └── Services/
│   │       └── QueueService.cs     # In-memory implementation of IQueueService
│   │
│   ├── MusicBot.Web/               # API + SPA + business logic
│   │   ├── Controllers/            # 16 controllers (see API Reference)
│   │   ├── Services/               # 30+ services (see Services section)
│   │   ├── Hubs/
│   │   │   └── OverlayHub.cs       # SignalR hub for OBS overlays
│   │   ├── Data/
│   │   │   ├── MusicBotDbContext.cs
│   │   │   └── PlatformConfig.cs
│   │   ├── clientapp/              # React 19 + TypeScript (Vite)
│   │   │   ├── src/
│   │   │   │   ├── pages/
│   │   │   │   │   └── Dashboard.tsx
│   │   │   │   ├── components/     # 13 components (see Frontend section)
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useSignalR.ts
│   │   │   │   │   └── useTheme.ts
│   │   │   │   ├── services/
│   │   │   │   │   └── api.ts      # HTTP client for all endpoints
│   │   │   │   ├── types/
│   │   │   │   │   └── models.ts   # TypeScript interfaces for the API
│   │   │   │   ├── App.css         # Global styles (dark/light theme)
│   │   │   │   ├── App.tsx
│   │   │   │   ├── index.tsx
│   │   │   │   └── utils.ts
│   │   │   └── public/
│   │   │       └── overlays/       # HTML/CSS/JS for OBS overlays (static)
│   │   ├── wwwroot/                # Vite compiled output (generated — do not edit)
│   │   ├── WebHost.cs              # Service registration and HTTP pipeline
│   │   ├── LocalUser.cs            # Single local user (desktop mode)
│   │   ├── AppEvents.cs            # Static events between Web and Desktop
│   │   ├── GlobalUsings.cs
│   │   └── appsettings.json
│   │
│   └── MusicBot.Desktop/           # WPF shell
│       ├── Program.cs              # Entry point + Velopack updater
│       ├── App.xaml.cs
│       ├── MainWindow.xaml.cs      # WebView2 pointing to Kestrel
│       ├── LogViewerWindow.xaml.cs
│       ├── TikTokLoginWindow.xaml.cs # TikTok login via WebView2
│       ├── TrayLifetime.cs         # System tray icon
│       └── LogSink.cs              # Serilog sink → log viewer window
│
├── relay/                          # Cloudflare Worker (OAuth proxy)
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── README.md                   # Relay deployment instructions
│
├── build/
│   └── Build.cs                    # NUKE build (Clean/Compile/Publish/Pack)
│
├── docs/                           # Public web pages (GitHub Pages)
│   ├── index.html
│   ├── tos.html
│   └── privacy.html
│
├── MusicBot.sln
└── README.md                       # This file
```

---

## Backend — Services

### Core

| Service | Type | Description |
|---------|------|-------------|
| `UserContextManager` | Singleton | Central registry of active users. Maps `Guid userId → UserServices`. |
| `QueueService` | Per-user | In-memory queue: enqueue, dequeue, reorder, skip, revoke. |
| `CommandRouterService` | Singleton | Dispatches `BotCommand` (play/skip/bump) to the correct user service. |
| `PlaybackSyncService` | BackgroundService | Polls playback state every 500ms. Auto-advances the queue when a song ends or an external skip is detected. |
| `SignalRBroadcastService` | BackgroundService | Subscribes to queue/player changes and publishes them to the `OverlayHub`. |
| `QueuePersistenceService` | BackgroundService | Persists and restores the queue from SQLite across restarts. |

### Download and Playback

| Service | Description |
|---------|-------------|
| `YtDlpDownloaderService` | Manages a `yt-dlp` process. Searches YouTube, downloads audio, emits progress events via SignalR. |
| `YtDlpSetupService` | BackgroundService that verifies yt-dlp availability on startup. |
| `LocalPlayerService` | Plays audio via WASAPI (NAudio). Play/pause/stop/seek/volume/device switching. |
| `LocalLibraryService` | Manages the catalog of downloaded tracks on disk. |
| `ItunesMetadataService` | Fetches clean metadata (cover art, duration) from the public iTunes API. |

### Platform Integration

| Service | Description |
|---------|-------------|
| `TikTokService` | Listens to TikTok Live chat via `TikTokLive_Sharp`. Detects `!play` commands, gifts (coins) and subscriptions. |
| `TwitchService` | Twitch bot via `TwitchLib`. Listens for `!play` in chat. |
| `KickService` | Kick.com integration via `KickChatSpy`. |
| `ChatResponseService` | Formats and sends responses to chat (song added confirmation, errors). |
| `PlatformConnectionManager` | Manages the lifecycle (connect/disconnect) of each platform. |
| `PlatformAutoConnectService` | BackgroundService that automatically reconnects on startup. |
| `IntegrationStatusTracker` | Emits each platform's connection status to the frontend via SignalR. |

### Platform Auth (OAuth)

| Service | Description |
|---------|-------------|
| `SpotifyService` | OAuth with Spotify. Manages tokens, refresh, and song search. |
| `TwitchAuthService` | Handles the Twitch OAuth callback. |
| `KickAuthService` | Handles the Kick OAuth callback with PKCE. |
| `TikTokAuthService` | Cookie-based session login (WebView2 in Desktop). |

### Advanced Queue

| Service | Description |
|---------|-------------|
| `AutoQueueService` | Pool of up to 100 songs that play automatically when the queue is empty. |
| `QueueSettingsService` | Persists queue configuration (limits, voting, presence check). |
| `BannedSongService` | Blacklist of songs users cannot request. |
| `PresenceCheckService` | Confirms the requesting user is still in chat before playing their song. |
| `KickVoteService` | Tallies and validates skip votes (`!si`/`!no`). |
| `TickerMessageService` | In-memory list of messages for the overlay ticker. |

---

## Backend — API Reference

The full API is available in interactive format at `/scalar/v1` when the server is running.

### Authentication

The API uses a "Smart" scheme that accepts two mechanisms:
- **JWT Bearer** — `Authorization: Bearer <token>` (obtained from `/api/auth/login`)
- **API Key** — `X-Api-Key: <key>` (created from the settings panel)

Public queue endpoints (`/api/queue/~/...`) do not require authentication.

### Main Endpoints

#### Auth & OAuth — `/api/auth`

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/me` | Current user + Spotify status |
| `GET` | `/spotify` | Start Spotify OAuth flow |
| `GET` | `/spotify/callback` | Spotify callback |
| `DELETE` | `/spotify` | Disconnect Spotify |
| `GET` | `/twitch` | Start Twitch OAuth flow |
| `GET` | `/twitch/callback` | Twitch callback |
| `DELETE` | `/twitch` | Disconnect Twitch |
| `GET` | `/kick` | Start Kick OAuth flow |
| `GET` | `/kick/callback` | Kick callback |
| `DELETE` | `/kick` | Disconnect Kick |
| `POST` | `/tiktok/start` | Start TikTok login (opens WebView2) |

#### Queue — `/api/queue`

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | Full queue state |
| `GET` | `/now-playing` | Current song |
| `GET` | `/~/now-playing` | Public now-playing (no auth) |
| `DELETE` | `/item` | Remove song from queue |
| `POST` | `/move` | Reorder (drag & drop) |
| `POST` | `/play-now` | Insert at front of queue |
| `POST` | `/enqueue` | Add to end of queue |
| `POST` | `/import-playlist` | Import YouTube/Spotify playlist |
| `POST` | `/start-auto` | Force auto-queue start |

#### Commands — `/api`

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/search?q=&limit=` | Mixed search across YouTube + iTunes + Spotify |
| `POST` | `/play` | Search and enqueue a song |
| `POST` | `/skip` | Skip the current song |
| `POST` | `/pause` | Pause playback |
| `POST` | `/resume` | Resume playback |
| `POST` | `/vote` | Cast a skip vote (`!si`/`!no`) |
| `POST` | `/queue/gift-bump` | Simulate a gift bump (coins) |

#### Player — `/api/player`

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/volume` | Change volume (0.0–1.0) |
| `POST` | `/seek` | Seek to position (ms) |
| `GET` | `/devices` | List WASAPI audio devices |
| `POST` | `/device` | Change output device |

#### Auto-queue — `/api/autoqueue`

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | List songs in the pool |
| `POST` | `/` | Add song to the pool |
| `DELETE` | `/{uri}` | Remove song from pool |
| `DELETE` | `/` | Clear the pool |
| `POST` | `/import` | Import playlist into pool |

#### Other

| Route | Description |
|-------|-------------|
| `GET /api/history` | Playback history |
| `DELETE /api/history` | Clear history |
| `GET /api/library` | Downloaded tracks library |
| `DELETE /api/library/{id}` | Delete track from library |
| `GET /api/banned` | Banned songs |
| `POST /api/banned` | Ban a song |
| `GET /api/settings` | Queue configuration |
| `PUT /api/settings` | Update configuration |
| `GET /api/platforms` | Connected platform statuses |
| `PUT /api/platforms/{platform}` | Save platform config |
| `GET /api/ticker` | Ticker messages |
| `POST /api/ticker` | Create message |
| `GET /health` | Health check |

---

## Frontend — Components

The SPA is a single-page application with one main page (`Dashboard`) and tab-based navigation.

### Dashboard (`pages/Dashboard.tsx`)

Main page. Manages global state (queue, now playing, settings, tabs) and passes handlers down to child components.

**Available tabs:** Queue · History · Library · Auto Queue · Platforms · Overlays · Settings · Messages

### Components

| Component | Key Props | Description |
|-----------|-----------|-------------|
| `NowPlaying` | `state`, `onSkip`, `onPause`, `onResume`, `onAddToAutoQueue` | Player card. Seek progress bar, volume control, audio device selector. |
| `QueueList` | `items`, `onRemove`, `onReorder`, `onBan`, `onAddToAutoQueue` | Queue list with drag & drop reordering. Shows per-song download progress. |
| `AddSong` | `onAdded` | Search box. Shows results with "▶ Now" and "+ Queue" buttons. |
| `SongHistory` | `refreshKey`, `onAddToAutoQueue` | Filterable history. Play, enqueue, and add to auto-queue from history. |
| `AutoQueuePanel` | `nowPlaying` | Auto-queue pool: search/add songs, import playlists, quick-add the current song. |
| `Library` | — | Downloaded tracks library. Shows playback stats and allows deleting files. |
| `PlatformConnections` | `tiktokEvents`, `twitchEvents`, `kickEvents` | Connect/disconnect TikTok, Twitch and Kick. Real-time chat event log. |
| `OverlayLinks` | — | Public URLs to add as browser sources in OBS. |
| `SettingsPanel` | — | Queue, voting, presence, auto-queue and desktop settings. |
| `QueueToolsModal` | `open`, `onClose`, simulation props | Modal with playlist import and simulation tools (votes, gifts). |
| `TickerMessages` | — | CRUD for overlay ticker messages. |
| `StatusBar` | `connected`, platform states | Status indicators in the header. |

### Hooks

#### `useSignalR(overlayToken)`

Connects to the `/hub/overlay` hub and maintains real-time state. Returns:

```typescript
{
  nowPlaying: NowPlayingState | null,
  appQueue: QueueItem[],
  connected: boolean,
  tiktokStatus: PlatformState | null,
  twitchStatus: PlatformState | null,
  kickStatus: PlatformState | null,
  integrationEvents: IntegrationEvent[],
  queueSettings: QueueSettings,
  tickerMessages: TickerMessage[],
  queueUpdateCount: number,
  downloadStates: Record<string, DownloadState>,
  downloadErrors: DownloadError[],
  dismissDownloadError: (id: string) => void,
}
```

Handles automatic reconnection with backoff `[0s, 2s, 5s, 10s, 30s]`.

#### `useTheme()`

Light/dark theme toggle persisted in `localStorage`.

### HTTP Client (`services/api.ts`)

Wrapper over `fetch` with base URL from `VITE_API_URL` (or relative in production). Includes methods for every API endpoint.

```typescript
// Usage examples
await api.search("queen bohemian", 10);
await api.play("bohemian rhapsody queen", "Admin", "web");
await api.skip("Admin");
await api.addAutoQueueSong({ spotifyUri, title, artist, durationMs });
await api.importPlaylist("https://www.youtube.com/playlist?list=...", "Admin");
```

---

## Database

SQLite via EF Core. The `musicbot.db` file is created automatically with `Database.EnsureCreated()` on startup — **no migrations**.

> For schema changes in development: delete `musicbot.db` and restart. The app will recreate all tables.

### Tables

| Table | Model | Description |
|-------|-------|-------------|
| `Users` | `AppUser` | Registered users (username, slug, password hash, overlay token) |
| `ApiKeys` | `UserApiKey` | API keys per user |
| `SpotifyTokens` | `SpotifyToken` | Spotify access token + refresh token |
| `CachedTracks` | `CachedTrack` | Downloaded songs (metadata + file path) |
| `PlayedSongs` | `PlayedSong` | Playback history |
| `AutoQueueSongs` | `AutoQueueSong` | Auto-queue pool (max 100) |
| `PersistedQueueItems` | `PersistedQueueItem` | Queue saved across restarts |
| `PlatformConfigs` | `PlatformConfig` | TikTok/Twitch/Kick config per user |
| `TickerMessages` | `TickerMessage` | Overlay ticker messages |
| `BannedSongs` | — | Banned songs |
| `QueueSettings` | — | Persisted queue configuration |

---

## Real-time (SignalR)

The `OverlayHub` at `/hub/overlay` is the real-time communication channel.

### Connecting (client)

```typescript
const connection = new HubConnectionBuilder()
  .withUrl("/hub/overlay")
  .build();

await connection.start();
await connection.invoke("JoinUserGroup", overlayToken);
```

### Events emitted by the server

| Event | Payload | When |
|-------|---------|------|
| `queue:updated` | `QueueState` | Queue or now-playing changes |
| `download:started` | `{ spotifyUri, title, artist }` | Track download begins |
| `download:progress` | `{ spotifyUri, pct }` | Download progress (0–100) |
| `download:done` | `{ spotifyUri }` | Download complete |
| `queue:download-failed` | `{ spotifyUri, title, artist, error }` | Download error |
| `integration:event` | `IntegrationEvent` | Chat action (play, gift, sub) |
| `platform:status` | `PlatformState` | Platform connection state change |
| `settings:updated` | `QueueSettings` | Queue configuration updated |
| `ticker:updated` | `TickerMessage[]` | Ticker message list updated |

---

## Relay OAuth

The relay is a Cloudflare Worker that acts as an OAuth proxy so the `client_secret` never lives in the desktop app.

```
Desktop App  →  relay (X-Relay-Key)  →  Spotify/Twitch/Kick OAuth
               (client_secret stored in Cloudflare, never in code)
```

See [`relay/README.md`](relay/README.md) for full deployment instructions.

**Minimal setup:**

```bash
cd relay
npm install
wrangler login
wrangler deploy
wrangler secret put RELAY_API_KEY       # generate a random UUID
wrangler secret put SPOTIFY_CLIENT_ID
wrangler secret put SPOTIFY_CLIENT_SECRET
# (same for Twitch and Kick)
```

---

## Build and Distribution

Distribution uses [Velopack](https://velopack.io/) for installer and delta updates.

### Development build

```bash
# Option 1: NUKE (recommended — same as CI)
./build.cmd --target Compile

# Option 2: direct
dotnet build MusicBot.sln
```

### Generate installer

```bash
./build.cmd --target Pack --configuration Release --runtime win-x86 --version 1.2.3
# Output: artifacts/MusicBot-1.2.3-Setup.exe
```

### CI/CD (GitHub Actions)

The workflow `.github/workflows/build.yml` triggers when a `v*` tag is pushed:

```bash
git tag v1.2.3
git push --tags
# → GitHub Actions generates the installer and creates a Release automatically
```

**Pipeline steps:**
1. Setup .NET 9 + Node.js 20
2. `./build.cmd --target Pack ...`
3. Create GitHub Release with the `.exe` as an asset

---

## License

See the repository for license terms.
