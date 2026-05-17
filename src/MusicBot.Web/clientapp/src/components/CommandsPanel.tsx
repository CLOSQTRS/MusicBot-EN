import React from "react";

type Role = "viewer" | "admin";

interface Command {
  syntax: string;
  aliases?: string;
  description: string;
  example?: string;
  role: Role;
}

const COMMANDS: Command[] = [
  // ── Viewer ──────────────────────────────────────────────────────────────────
  {
    role: "viewer",
    syntax: "!play <song>",
    aliases: "!sr",
    description: "Request a song by name, artist, or YouTube URL.",
    example: "!play Bad Bunny Tití me preguntó",
  },
  {
    role: "viewer",
    syntax: "!revoke",
    aliases: "!quitar",
    description: "Remove your own song from the queue before it plays.",
  },
  {
    role: "viewer",
    syntax: "!skip",
    description: "Skip your song if it is currently playing (yours only).",
  },
  {
    role: "viewer",
    syntax: "!bump",
    description: "Move your song one position up in the queue.",
  },
  {
    role: "viewer",
    syntax: "!pos",
    aliases: "!position",
    description: "Show your song's position and estimated wait time.",
  },
  {
    role: "viewer",
    syntax: "!info",
    description: "Show how many songs you have in the queue and at which positions.",
  },
  {
    role: "viewer",
    syntax: "!song",
    aliases: "!cancion · !current",
    description: "Show the song currently playing.",
  },
  {
    role: "viewer",
    syntax: "!queue",
    aliases: "!cola",
    description: "Show the upcoming songs in the request queue.",
  },
  {
    role: "viewer",
    syntax: "!history",
    aliases: "!historial",
    description: "Show the last 3 songs played.",
  },
  {
    role: "viewer",
    syntax: "!like",
    aliases: "!love",
    description: "Save the current song to the auto-queue so it plays again.",
  },
  {
    role: "viewer",
    syntax: "!aqui",
    aliases: "!here",
    description: "Confirm your presence when the bot notifies you that your song is about to play.",
  },
  {
    role: "viewer",
    syntax: "!si · !yes / !no",
    description: "Vote to skip (or keep) the current song during a vote.",
  },
  {
    role: "viewer",
    syntax: "!keep",
    description: "Save the current song from being removed during a skip vote.",
  },
];

const RoleBadge: React.FC<{ role: Role }> = ({ role }) => (
  <span className={`cmd-role-badge cmd-role-${role}`}>
    {role === "admin" ? "Admin" : "Viewer"}
  </span>
);

export const CommandsPanel: React.FC = () => (
  <div className="commands-panel">
    <div className="commands-panel-header">
      <p className="commands-panel-hint">
        All commands work with the prefixes <code>!</code>, <code>.</code> and <code>/</code>
        &nbsp;— e.g. <code>!play</code>, <code>.play</code> or <code>/play</code>.
      </p>
    </div>
    <table className="commands-table">
      <thead>
        <tr>
          <th>Command</th>
          <th>Alias</th>
          <th>Role</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {COMMANDS.map((cmd, i) => (
          <tr key={i}>
            <td><code>{cmd.syntax}</code></td>
            <td>{cmd.aliases ? <code>{cmd.aliases}</code> : <span className="commands-none">—</span>}</td>
            <td><RoleBadge role={cmd.role} /></td>
            <td>
              {cmd.description}
              {cmd.example && (
                <span className="commands-example"> Ex: <code>{cmd.example}</code></span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
