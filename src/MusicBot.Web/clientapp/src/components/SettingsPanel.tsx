import React, { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { QueueSettings } from "../hooks/useSignalR";
import { useConfirm } from "../hooks/useConfirm";

interface Props {
  settings: QueueSettings;
}

export const SettingsPanel: React.FC<Props> = ({ settings }) => {
  const [confirmModal, confirm] = useConfirm();
  const [form,    setForm]    = useState(settings);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);
  const [spotifyBusy,      setSpotifyBusy]      = useState(false);

  const [ytAuth, setYtAuth] = useState<{ enabled: boolean; authenticated: boolean; account: string | null; savedAt: string | null } | null>(null);
  const [ytBusy, setYtBusy] = useState(false);

  const [relayStatus, setRelayStatus] = useState<{ configured: boolean; reachable: boolean; error: string | null } | null>(null);
  const [relayChecking, setRelayChecking] = useState(false);

  const [ytDlpUpdating, setYtDlpUpdating] = useState(false);
  const [ytDlpMsg,      setYtDlpMsg]      = useState<{ text: string; err: boolean } | null>(null);

  const handleUpdateYtDlp = useCallback(async () => {
    setYtDlpUpdating(true);
    setYtDlpMsg(null);
    try {
      const r = await api.updateYtDlp();
      setYtDlpMsg({ text: r.message, err: false });
    } catch (e: unknown) {
      setYtDlpMsg({ text: e instanceof Error ? e.message : "Error updating", err: true });
    } finally {
      setYtDlpUpdating(false);
    }
  }, []);

  const checkRelay = useCallback(async () => {
    setRelayChecking(true);
    try {
      setRelayStatus(await api.getRelayStatus());
    } catch {
      setRelayStatus({ configured: false, reachable: false, error: "Could not contact server" });
    } finally {
      setRelayChecking(false);
    }
  }, []);

  // Sync if settings change via SignalR from another client
  useEffect(() => { setForm(settings); }, [settings]);

  const refreshYtAuth = useCallback(() => {
    api.getYouTubeAuthStatus()
      .then(r => setYtAuth({ enabled: r.enabled, authenticated: r.authenticated, account: r.account, savedAt: r.savedAt }))
      .catch(() => setYtAuth({ enabled: false, authenticated: false, account: null, savedAt: null }));
  }, []);

  useEffect(() => {
    api.getSpotifyStatus().then(r => setSpotifyConnected(r.authenticated)).catch(() => setSpotifyConnected(false));
    refreshYtAuth();
    checkRelay();
  }, [checkRelay, refreshYtAuth]);

  const handleYouTubeConnect = async () => {
    const ok = await confirm({
      title:       "Use a disposable account",
      message: (
        <>
          You are about to sign in with a Google account. Cookies will be saved to disk and any
          process with access to the file can impersonate that account. YouTube may also ban it due
          to yt-dlp usage.
          <br/><br/>
          Use a new account created only for this purpose,{" "}
          <strong style={{
            background:   "#fde047",
            color:        "#1a1a1a",
            padding:      "2px 6px",
            borderRadius: 4,
            fontWeight:   800,
          }}>
            NEVER your personal account
          </strong>.
        </>
      ),
      confirmText: "I understand the risk, continue",
      danger:      true,
    });
    if (!ok) return;
    setYtBusy(true);
    try {
      await api.startYouTubeLogin();
      // Poll until cookies are captured
      const poll = setInterval(async () => {
        const r = await api.getYouTubeAuthStatus().catch(() => null);
        if (r?.authenticated) {
          setYtAuth({ enabled: r.enabled, authenticated: true, account: r.account, savedAt: r.savedAt });
          clearInterval(poll);
          setYtBusy(false);
        } else if (r?.cancelled) {
          clearInterval(poll);
          setYtBusy(false);
        }
      }, 1500);
      setTimeout(() => { clearInterval(poll); setYtBusy(false); }, 180_000);
    } catch { setYtBusy(false); }
  };

  const handleYouTubeDisconnect = async () => {
    const ok = await confirm({ title: "Disconnect YouTube?", message: "Saved cookies will be deleted. Downloads requiring authentication will fail again with 'Sign in to confirm you're not a bot'.", confirmText: "Disconnect", danger: true });
    if (!ok) return;
    setYtBusy(true);
    try {
      await api.disconnectYouTubeAuth();
      refreshYtAuth();
    } finally { setYtBusy(false); }
  };

  const handleYouTubeToggle = async () => {
    if (!ytAuth) return;
    setYtBusy(true);
    try {
      if (ytAuth.enabled) await api.disableYouTubeAuth();
      else                 await api.enableYouTubeAuth();
      refreshYtAuth();
    } finally { setYtBusy(false); }
  };

  const handleSpotifyConnect = async () => {
    setSpotifyBusy(true);
    try {
      const { url } = await api.getSpotifyAuthUrl();
      window.open(url, "_blank", "width=500,height=700");
      // Poll until connected
      const poll = setInterval(async () => {
        const r = await api.getSpotifyStatus().catch(() => ({ authenticated: false }));
        if (r.authenticated) { setSpotifyConnected(true); clearInterval(poll); setSpotifyBusy(false); }
      }, 2000);
      setTimeout(() => { clearInterval(poll); setSpotifyBusy(false); }, 120_000);
    } catch { setSpotifyBusy(false); }
  };

  const handleSpotifyDisconnect = async () => {
    const ok = await confirm({ title: "Disconnect Spotify?", message: "You will need to re-authorize the app to use Spotify features.", confirmText: "Disconnect", danger: true });
    if (!ok) return;
    setSpotifyBusy(true);
    try {
      await api.disconnectSpotify();
      setSpotifyConnected(false);
    } finally {
      setSpotifyBusy(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save settings", e);
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof QueueSettings, value: number | boolean | string) =>
    setForm(f => ({ ...f, [key]: value }));

  return (
    <>{confirmModal}
    <div className="settings-panel">
      <div className="settings-section">
        <div className="settings-section-title">Playback queue</div>

        <label className="settings-row">
          <span className="settings-label">Maximum queue size</span>
          <input
            type="number" min={1} max={500}
            className="input settings-input-sm"
            value={form.maxQueueSize}
            onChange={e => set("maxQueueSize", Number(e.target.value))}
          />
          <span className="settings-unit">songs</span>
        </label>

        <label className="settings-row">
          <span className="settings-label">Max. songs per user</span>
          <input
            type="number" min={1} max={50}
            className="input settings-input-sm"
            value={form.maxSongsPerUser}
            onChange={e => set("maxSongsPerUser", Number(e.target.value))}
          />
          <span className="settings-unit">per user</span>
        </label>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Skip voting</div>

        <label className="settings-row settings-row-toggle">
          <span className="settings-label">Enable skip voting at song start</span>
          <div
            className={`settings-toggle${form.votingEnabled ? " on" : ""}`}
            onClick={() => set("votingEnabled", !form.votingEnabled)}
          >
            <div className="settings-toggle-thumb" />
          </div>
        </label>
        <p className="settings-hint">
          When active, each song opens a 30-second vote in chat (!si = skip · !no = keep).
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Presence check</div>

        <label className="settings-row settings-row-toggle">
          <span className="settings-label">Enable presence check at song start</span>
          <div
            className={`settings-toggle${form.presenceCheckEnabled ? " on" : ""}`}
            onClick={() => set("presenceCheckEnabled", !form.presenceCheckEnabled)}
          >
            <div className="settings-toggle-thumb" />
          </div>
        </label>

        <label className="settings-row">
          <span className="settings-label">Advance warning time</span>
          <input
            type="number" min={5} max={120}
            className="input settings-input-sm"
            value={form.presenceCheckWarningSeconds}
            onChange={e => set("presenceCheckWarningSeconds", Number(e.target.value))}
            disabled={!form.presenceCheckEnabled}
          />
          <span className="settings-unit">seconds before</span>
        </label>

        <label className="settings-row">
          <span className="settings-label">Confirmation time at start</span>
          <input
            type="number" min={5} max={120}
            className="input settings-input-sm"
            value={form.presenceCheckConfirmSeconds}
            onChange={e => set("presenceCheckConfirmSeconds", Number(e.target.value))}
            disabled={!form.presenceCheckEnabled}
          />
          <span className="settings-unit">seconds</span>
        </label>

        <p className="settings-hint">
          The requester is notified N seconds before and confirmation with <code>!aqui</code> is expected at start. If they do not confirm, the song is skipped. Other users can use <code>!keep</code> to save it.
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Downloads</div>

        <label className="settings-row settings-row-toggle">
          <span className="settings-label">Save downloaded files permanently</span>
          <div
            className={`settings-toggle${form.saveDownloads ? " on" : ""}`}
            onClick={() => set("saveDownloads", !form.saveDownloads)}
          >
            <div className="settings-toggle-thumb" />
          </div>
        </label>
        <p className="settings-hint">
          If disabled, files are automatically deleted after they finish playing.
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Spotify</div>
        <div className="settings-row">
          <span className="settings-label">Connection status</span>
          <span style={{ fontWeight: 600, color: spotifyConnected ? "var(--color-success, #1db954)" : "var(--color-muted, #888)" }}>
            {spotifyConnected === null ? "Checking…" : spotifyConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="settings-row" style={{ gap: 8 }}>
          {spotifyConnected
            ? <button className="btn btn-sm btn-danger" onClick={handleSpotifyDisconnect} disabled={spotifyBusy}>
                {spotifyBusy ? "Disconnecting…" : "Disconnect Spotify"}
              </button>
            : <button className="btn btn-sm btn-primary" onClick={handleSpotifyConnect} disabled={spotifyBusy}>
                {spotifyBusy ? "Opening…" : "Connect Spotify"}
              </button>
          }
        </div>
        <p className="settings-hint">
          If playlist import returns error 403, disconnect and reconnect to renew permissions.
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">YouTube (cookies for downloads)</div>

        <label className="settings-row settings-row-toggle">
          <span className="settings-label">Use YouTube cookies in yt-dlp</span>
          <div
            className={`settings-toggle${ytAuth?.enabled ? " on" : ""}`}
            onClick={() => !ytBusy && handleYouTubeToggle()}
          >
            <div className="settings-toggle-thumb" />
          </div>
        </label>
        <p className="settings-hint">
          When active and you have a connected session, yt-dlp uses your cookies to avoid the
          <em> "Sign in to confirm you're not a bot"</em> block and HTTP 429 errors. Cookies are stored locally in
          <code> %LOCALAPPDATA%/MusicBot/youtube_cookies.txt</code> and are never sent to any external server.
        </p>

        <div className="settings-row">
          <span className="settings-label">Connection status</span>
          <span style={{ fontWeight: 600, color:
              ytAuth === null                ? "var(--color-muted, #888)"
            : ytAuth.authenticated           ? "var(--color-success, #1db954)"
            : ytAuth.enabled                 ? "var(--color-danger, #e05252)"
            :                                  "var(--color-muted, #888)" }}>
            {ytAuth === null
              ? "Checking…"
              : ytAuth.authenticated
                ? `Connected${ytAuth.account ? ` (${ytAuth.account})` : ""}`
                : ytAuth.enabled
                  ? "No session — connect to activate"
                  : "Disabled"}
          </span>
        </div>

        <div className="settings-row" style={{ gap: 8 }}>
          {ytAuth?.authenticated
            ? <button className="btn btn-sm btn-danger" onClick={handleYouTubeDisconnect} disabled={ytBusy}>
                {ytBusy ? "Processing…" : "Disconnect YouTube"}
              </button>
            : <button className="btn btn-sm btn-primary" onClick={handleYouTubeConnect} disabled={ytBusy}>
                {ytBusy ? "Waiting for login…" : "Connect YouTube"}
              </button>
          }
        </div>
        <p className="settings-hint">
          Sign in once with your Google account in the embedded window. The session is automatically restored when the app starts.
          If cookies expire (~6 months), reconnect.
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Relay OAuth</div>
        <div className="settings-row">
          <span className="settings-label">Status</span>
          <span style={{
            fontWeight: 600,
            color: !relayStatus
              ? "var(--color-muted, #888)"
              : relayStatus.reachable
              ? "var(--color-success, #1db954)"
              : "var(--color-danger, #e05252)",
          }}>
            {!relayStatus
              ? "Checking…"
              : !relayStatus.configured
              ? "Not configured"
              : relayStatus.reachable
              ? "Active"
              : `Error${relayStatus.error ? `: ${relayStatus.error}` : ""}`}
          </span>
        </div>
        <div className="settings-row" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={checkRelay} disabled={relayChecking}>
            {relayChecking ? "Checking…" : "Check connection"}
          </button>
        </div>
        <p className="settings-hint">
          Secure proxy on Cloudflare Workers that manages OAuth token exchange with Spotify, Twitch and Kick. The <code>client_secret</code> is stored only in the Worker, never on the client.
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Auto-queue</div>

        <label className="settings-row settings-row-toggle">
          <span className="settings-label">Enable auto-queue</span>
          <div
            className={`settings-toggle${form.autoQueueEnabled ? " on" : ""}`}
            onClick={() => set("autoQueueEnabled", !form.autoQueueEnabled)}
          >
            <div className="settings-toggle-thumb" />
          </div>
        </label>
        <p className="settings-hint">
          When the request queue is empty, plays songs randomly from the auto-queue pool.
          Manage the pool in the <strong>Auto-queue</strong> tab.
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Application</div>

        <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn-sm" onClick={handleUpdateYtDlp} disabled={ytDlpUpdating}>
              {ytDlpUpdating ? "Updating…" : "Update yt-dlp"}
            </button>
          </div>
          {ytDlpMsg && (
            <span style={{ fontSize: 12, color: ytDlpMsg.err ? "var(--color-error, #ef4444)" : "var(--color-success, #22c55e)" }}>
              {ytDlpMsg.text}
            </span>
          )}
        </div>
        <p className="settings-hint">
          Downloads the latest version of yt-dlp from GitHub. Required when YouTube changes its anti-bot system (error "Sign in to confirm you're not a bot"). The app also updates automatically on startup if the binary is more than 7 days old.
        </p>

        <label className="settings-row settings-row-toggle">
          <span className="settings-label">Open log window on start</span>
          <div
            className={`settings-toggle${form.openLogOnStart ? " on" : ""}`}
            onClick={() => set("openLogOnStart", !form.openLogOnStart)}
          >
            <div className="settings-toggle-thumb" />
          </div>
        </label>
        <p className="settings-hint">
          Automatically opens the system log window when MusicBot starts. Useful for debugging.
        </p>
      </div>

      <div className="settings-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
    </>
  );
};
