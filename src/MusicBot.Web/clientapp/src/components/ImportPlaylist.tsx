import React, { useState } from "react";
import { api } from "../services/api";

export const ImportPlaylist: React.FC = () => {
  const [url,         setUrl]         = useState("");
  const [requestedBy, setRequestedBy] = useState("Admin");
  const [loading,     setLoading]     = useState(false);
  const [message,     setMessage]     = useState<{ text: string; ok: boolean } | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.importPlaylist(url.trim(), requestedBy);
      setMessage({ text: `✓ ${res.added} songs added (${res.skipped} skipped from ${res.total})`, ok: true });
      if (res.added > 0) setUrl("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error importing playlist";
      setMessage({ text: msg, ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="import-playlist-form" onSubmit={handleImport}>
      <p className="import-playlist-hint">
        Paste a YouTube or Spotify playlist URL to add all its songs to the queue (max. 50).
      </p>
      <div className="form-row">
        <input
          type="text"
          className="input"
          placeholder="https://www.youtube.com/playlist?list=… or https://open.spotify.com/playlist/…"
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={loading}
        />
        <input
          type="text"
          className="input input-sm"
          placeholder="Requested by"
          value={requestedBy}
          onChange={e => setRequestedBy(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={loading || !url.trim()}
        >
          {loading ? "Importing…" : "Import playlist"}
        </button>
      </div>
      {message && (
        <div className={`form-message${message.ok ? "" : " form-message-error"}`}>
          {message.text}
        </div>
      )}
    </form>
  );
};
