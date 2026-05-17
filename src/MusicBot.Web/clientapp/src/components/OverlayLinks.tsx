import React, { useState } from "react";

const BASE = window.location.origin;

interface Props {
  overlayToken: string;
}

export const OverlayLinks: React.FC<Props> = ({ overlayToken }) => {
  const [copied,       setCopied]       = useState<string | null>(null);
  const [overlayTheme, setOverlayTheme] = useState<"dark" | "light">("dark");
  const t = overlayToken;

  const overlays = [
    {
      label:       "Full player (responsive)",
      description: "Now Playing + Queue in a single overlay. On large screens it shows two columns; on small screens it stacks vertically. Recommended.",
      path:        `/overlays/player/index.html?token=${t}`,
      sizeLarge:   "860×420 px (2 columns)",
      sizeSmall:   "360×640 px (vertical)",
      recommended: true,
    },
    {
      label:       "Now Playing only",
      description: "Shows only the currently playing song with cover art and progress bar.",
      path:        `/overlays/now-playing/index.html?token=${t}`,
      sizeLarge:   "640×120 px",
      sizeSmall:   "",
      recommended: false,
    },
    {
      label:       "Queue only",
      description: "Compact list of songs waiting in queue.",
      path:        `/overlays/queue/index.html?token=${t}`,
      sizeLarge:   "420×auto",
      sizeSmall:   "",
      recommended: false,
    },
  ];

  const themedPath = (path: string) => `${path}&theme=${overlayTheme}`;

  const copyUrl = (path: string) => {
    navigator.clipboard.writeText(`${BASE}${themedPath(path)}`);
    setCopied(path);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="overlay-links">
      <p className="overlay-hint">
        Add these URLs as a <strong>Browser Source</strong> in OBS, TikTok Live Studio, Meld or any streaming tool. The responsive overlay includes skip voting, new song notifications, and adapts to whatever size you configure.
      </p>

      <div className="overlay-theme-selector">
        <span className="overlay-theme-label">Overlay theme:</span>
        <div className="overlay-theme-btns">
          <button
            className={`btn btn-sm ${overlayTheme === "dark" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setOverlayTheme("dark")}
          >🌙 Dark</button>
          <button
            className={`btn btn-sm ${overlayTheme === "light" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setOverlayTheme("light")}
          >☀️ Light</button>
        </div>
        <span className="overlay-theme-hint">
          {overlayTheme === "dark"
            ? "Dark transparent background — ideal for dark wallpapers or games."
            : "Semi-transparent light background — ideal for streams with light color schemes."}
        </span>
      </div>

      {overlays.map(o => (
        <div key={o.path} className={`overlay-card${o.recommended ? " overlay-card-featured" : ""}`}>
          <div className="overlay-card-header">
            <span className="overlay-card-label">{o.label}</span>
            {o.recommended && <span className="overlay-recommended-badge">Recommended</span>}
          </div>
          <p className="overlay-card-desc">{o.description}</p>
          <div className="overlay-card-sizes">
            <span>🖥 {o.sizeLarge}</span>
            {o.sizeSmall && <span>📱 {o.sizeSmall}</span>}
          </div>
          <code className="overlay-link-url">{BASE}{themedPath(o.path)}</code>
          <div className="overlay-link-actions">
            <button className="btn btn-sm btn-primary" onClick={() => copyUrl(o.path)}>
              {copied === o.path ? "✓ Copied" : "Copy URL"}
            </button>
            <a href={themedPath(o.path)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
              Preview
            </a>
          </div>
        </div>
      ))}
    </div>
  );
};
