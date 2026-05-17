import React, { useState, useCallback, useRef, useEffect } from "react";
import { Sun, Moon, Power, FileText, Wrench, Music2, FolderOpen, Bot, Users, Coffee, LifeBuoy } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { MainBrowser } from "../components/MainBrowser";
import { QueuePanel } from "../components/QueuePanel";
import { PlayerBar } from "../components/PlayerBar";
import { StatusBar } from "../components/StatusBar";
import { QueueToolsModal } from "../components/QueueToolsModal";
import { ComunidadPanel } from "../components/ComunidadPanel";
import { DonacionesPanel } from "../components/DonacionesPanel";
import { SoportePanel } from "../components/SoportePanel";
import { useSignalR } from "../hooks/useSignalR";
import { useLikedSongs } from "../hooks/useLikedSongs";
import { useConfirm } from "../hooks/useConfirm";
import { api } from "../services/api";

type AppSection = "bot" | "comunidad" | "donaciones" | "soporte";

const SECTIONS: { id: AppSection; label: string; icon: React.ReactNode }[] = [
  { id: "bot",       label: "Manager",   icon: <Bot size={13} />      },
  { id: "comunidad", label: "Community", icon: <Users size={13} />    },
  { id: "soporte",   label: "Support",   icon: <LifeBuoy size={13} /> },
  { id: "donaciones",label: "Donations", icon: <Coffee size={13} />   },
];

const OVERLAY_TOKEN = "local";

function formatDownloadReason(raw: string): string {
  // Strip "yt-dlp failed for "X": " prefix
  const prefixed = raw.match(/^yt-dlp failed for ".+?": (.+)$/s);
  const msg = prefixed ? prefixed[1] : raw;

  // Map known yt-dlp error patterns to friendly messages
  if (/private video/i.test(msg))           return "The video is private";
  if (/video unavailable/i.test(msg))       return "The video is not available";
  if (/has been removed/i.test(msg))        return "The video was removed";
  if (/not available in your country/i.test(msg)) return "Not available in your region";
  if (/age.?restricted/i.test(msg))         return "The video has an age restriction";
  if (/no youtube match/i.test(msg))        return "Not found on YouTube";
  if (/output file not found/i.test(msg))   return "Error processing audio file";
  if (/unable to download/i.test(msg))      return "Could not download the video";
  if (/copyright/i.test(msg))               return "Blocked by copyright";

  // Return first line of the message (yt-dlp errors can be multi-line)
  return msg.split("\n")[0].trim();
}

export const Dashboard: React.FC = () => {
  const {
    nowPlaying, appQueue, activePlaylistName, connected,
    tiktokStatus, twitchStatus, kickStatus,
    integrationEvents, queueSettings, tickerMessages,
    queueUpdateCount, playlistUpdateCount, downloadStates, downloadErrors, authAlerts, authUpdatedAt, dismissDownloadError, dismissAuthAlert,
  } = useSignalR(OVERLAY_TOKEN);

  const { theme, toggle: toggleTheme } = useTheme();
  const { likedUris, toggleLike } = useLikedSongs(playlistUpdateCount);
  const [confirmModal, confirm] = useConfirm();

  // Keep libRefreshKey in sync with server-pushed playlist changes
  useEffect(() => {
    setLibRefreshKey(k => k + 1);
  }, [playlistUpdateCount]);

  const [appVersion,       setAppVersion]       = useState<string | null>(null);
  const [section,          setSection]          = useState<AppSection>("bot");
  const [selectedPlaylist, setSelectedPlaylist] = useState<number | null>(null);
  const [libRefreshKey,    setLibRefreshKey]    = useState(0);
  const [queueToolsOpen,   setQueueToolsOpen]   = useState(false);
  const [rightPanelMode,   setRightPanelMode]   = useState<"queue" | "nowplaying" | "devices">("queue");
  const [shuffleActive,    setShuffleActive]    = useState(false);

  // simulation state for QueueToolsModal
  const [voteUser,  setVoteUser]  = useState("Admin");
  const [giftUser,  setGiftUser]  = useState("");
  const [giftCoins, setGiftCoins] = useState(10);
  const [simMsg,    setSimMsg]    = useState<string | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getVersion().then(r => setAppVersion(r.version)).catch(() => {});
  }, []);

  const showSimMsg = (msg: string) => {
    setSimMsg(msg);
    if (simTimerRef.current) clearTimeout(simTimerRef.current);
    simTimerRef.current = setTimeout(() => setSimMsg(null), 3000);
  };

  const handleSkip   = useCallback(() => api.skip("Admin"),  []);
  const handlePause  = useCallback(() => api.pause(),        []);
  const handleResume = useCallback(() => api.resume(),       []);

  const prewarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerPrewarmDebounced = useCallback(() => {
    if (prewarmTimerRef.current) clearTimeout(prewarmTimerRef.current);
    prewarmTimerRef.current = setTimeout(() => api.prewarmNext(2).catch(() => {}), 3000);
  }, []);
  useEffect(() => () => { if (prewarmTimerRef.current) clearTimeout(prewarmTimerRef.current); }, []);

  const handleRemove  = useCallback((uri: string)                          => { api.removeQueueItem(uri).catch(console.error); }, []);
  const handleReorder = useCallback((uri: string, toIndex: number) => {
    api.reorderQueue(uri, toIndex).catch(console.error);
    triggerPrewarmDebounced();
  }, [triggerPrewarmDebounced]);

  const handlePromoteToQueue = useCallback((uri: string, toIndex?: number) => {
    api.promoteFromBackground(uri, toIndex).catch(console.error);
    triggerPrewarmDebounced();
  }, [triggerPrewarmDebounced]);

  const handleShuffleBackground = useCallback(() => {
    api.shuffleBackgroundPlaylist().catch(console.error);
    triggerPrewarmDebounced();
  }, [triggerPrewarmDebounced]);
  const handleToggleQueue   = useCallback(() => setRightPanelMode(m => m === "queue" ? "nowplaying" : "queue"), []);
  const handleToggleDevices = useCallback(() => setRightPanelMode(m => m === "devices" ? "queue" : "devices"), []);
  const handleToggleShuffle = useCallback(async () => {
    await api.shuffleQueue().catch(() => {});
    setShuffleActive(true);
    setTimeout(() => setShuffleActive(false), 800);
  }, []);

  const handleBan     = useCallback(async (uri: string, title: string, artist: string) => {
    const ok = await confirm({ title: `Ban "${title}"`, message: "The song cannot be requested again.", confirmText: "Ban", danger: true });
    if (!ok) return;
    api.banSong(uri, title, artist).catch(console.error);
    api.removeQueueItem(uri).catch(console.error);
  }, [confirm]);

  const handleVote = useCallback(async (skip: boolean) => {
    const r = await api.vote(voteUser || "Admin", skip, "web").catch(() => null);
    showSimMsg(r ? r.message : "Error voting");
  }, [voteUser]);

  const handleGiftBump = useCallback(async () => {
    if (!giftUser.trim()) { showSimMsg("Enter a user"); return; }
    const r = await api.giftBump(giftUser.trim(), giftCoins).catch(() => null);
    showSimMsg(r ? r.message : "Error");
  }, [giftUser, giftCoins]);

  const nowPlayingUri = (nowPlaying?.spotifyTrack ?? nowPlaying?.item?.song)?.spotifyUri ?? null;

  return (
    <div className="app-shell spotify-shell">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="header-brand" onClick={() => setSection("bot")} title="Manager">
            <span className="header-logo"><Music2 size={20} /></span>
            <span className="header-title">MusicBot</span>
            {appVersion && <span className="header-version">v{appVersion}</span>}
          </div>

          <nav className="header-section-nav">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className={`header-section-btn${section === s.id ? " active" : ""}`}
                onClick={() => setSection(s.id)}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBar
            signalRConnected={connected}
            tiktokStatus={tiktokStatus}
            twitchStatus={twitchStatus}
            kickStatus={kickStatus}
          />

          <button className="header-icon-btn" onClick={() => setQueueToolsOpen(true)} title="Queue tools"><Wrench size={15} /></button>
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Change theme">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="header-icon-btn" onClick={() => api.openLog()} title="Logs"><FileText size={15} /></button>
          <button className="header-icon-btn" onClick={() => api.openLogDir()} title="Logs folder"><FolderOpen size={15} /></button>
          <button className="header-icon-btn header-icon-btn-danger"
            onClick={async () => {
              const ok = await confirm({ title: "Close MusicBot?", message: "Playback will stop and the application will close.", confirmText: "Close", danger: true });
              if (ok) api.shutdown();
            }}
            title="Close"
          ><Power size={15} /></button>
        </div>
      </header>

      {/* ── Download error toasts ───────────────────────────── */}
      {downloadErrors.length > 0 && (
        <div className="download-error-stack">
          {downloadErrors.length > 1 && (
            <div className="download-error-toolbar">
              <span className="download-error-count">{downloadErrors.length} errors</span>
              <button
                className="download-error-dismiss-all"
                onClick={() => downloadErrors.forEach(e => dismissDownloadError(e.id))}
              >
                Clear all
              </button>
            </div>
          )}
          {downloadErrors.slice(0, 3).map(e => (
            <div key={e.id} className="download-error-toast">
              <span className="download-error-icon">⚠</span>
              <div className="download-error-body">
                <span className="download-error-text">
                  Could not download <strong>{e.title}</strong>
                  {e.artist ? ` · ${e.artist}` : ""}
                </span>
                {e.reason && (
                  <span className="download-error-reason">{formatDownloadReason(e.reason)}</span>
                )}
              </div>
              <button className="download-error-close" onClick={() => dismissDownloadError(e.id)}>✕</button>
            </div>
          ))}
          {downloadErrors.length > 3 && (
            <div className="download-error-overflow">
              +{downloadErrors.length - 3} más
            </div>
          )}
        </div>
      )}

      {/* ── Auth expiration alerts ──────────────────────────── */}
      {authAlerts.length > 0 && (
        <div className="download-error-stack">
          {authAlerts.map(a => (
            <div key={a.id} className="download-error-toast auth-alert-toast">
              <span className="download-error-icon">🔑</span>
              <div className="download-error-body">
                <span className="download-error-text"><strong>{a.platform.charAt(0).toUpperCase() + a.platform.slice(1)}</strong></span>
                <span className="download-error-reason">{a.message}</span>
              </div>
              <button className="download-error-close" onClick={() => dismissAuthAlert(a.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Body: 2 columns ─────────────────────────────────── */}
      <div className="spotify-body">

        {/* Center: section-dependent content */}
        {section === "bot" && (
          <MainBrowser
            selectedPlaylistId={selectedPlaylist}
            onSelectPlaylist={id => setSelectedPlaylist(id)}
            onClearSelection={() => setSelectedPlaylist(null)}
            onPlaylistsChanged={() => setLibRefreshKey(k => k + 1)}
            nowPlayingUri={nowPlayingUri}
            nowPlaying={nowPlaying}
            queueUpdateCount={queueUpdateCount}
            playlistsRefreshKey={libRefreshKey}
            likedUris={likedUris}
            onToggleLike={toggleLike}
            settings={queueSettings}
            tiktokEvents={integrationEvents.filter(e => e.source === "tiktok")}
            twitchEvents={integrationEvents.filter(e => e.source === "twitch")}
            kickEvents={integrationEvents.filter(e => e.source === "kick")}
            authUpdatedAt={authUpdatedAt}
            tickerMessages={tickerMessages}
            overlayToken={OVERLAY_TOKEN}
          />
        )}
        {section === "comunidad"  && <div className="section-panel"><ComunidadPanel /></div>}
        {section === "donaciones" && <div className="section-panel"><DonacionesPanel /></div>}
        {section === "soporte"    && <div className="section-panel"><SoportePanel /></div>}

        {/* Right: Queue / Now Playing / Devices */}
        <QueuePanel
          mode={rightPanelMode}
          items={appQueue}
          nowPlaying={nowPlaying}
          onRemove={handleRemove}
          onReorder={handleReorder}
          onPromoteToQueue={handlePromoteToQueue}
          onShuffleBackground={handleShuffleBackground}
          onBan={handleBan}
          downloadStates={downloadStates}
          queueUpdateCount={queueUpdateCount}
          activePlaylistName={activePlaylistName}
          likedUris={likedUris}
          onToggleLike={toggleLike}
        />
      </div>

      {/* ── Player bar (bottom) ─────────────────────────────── */}
      <PlayerBar
        state={nowPlaying}
        onSkip={handleSkip}
        onPause={handlePause}
        onResume={handleResume}
        downloadStates={downloadStates}
        rightPanelMode={rightPanelMode}
        onToggleQueue={handleToggleQueue}
        onToggleDevices={handleToggleDevices}
        shuffleActive={shuffleActive}
        onToggleShuffle={handleToggleShuffle}
        likedUris={likedUris}
        onToggleLike={toggleLike}
      />

      {/* ── Modals ──────────────────────────────────────────── */}
      {confirmModal}

      <QueueToolsModal
        open={queueToolsOpen}
        onClose={() => setQueueToolsOpen(false)}
        voteUser={voteUser}
        onVoteUserChange={setVoteUser}
        giftUser={giftUser}
        onGiftUserChange={setGiftUser}
        giftCoins={giftCoins}
        onGiftCoinsChange={setGiftCoins}
        onVote={handleVote}
        onGiftBump={handleGiftBump}
        simMsg={simMsg}
      />
    </div>
  );
};
