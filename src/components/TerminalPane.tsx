import { useEffect, useMemo, useRef } from "react";
import type { TerminalSession } from "../types";

interface TerminalPaneProps {
  open: boolean;
  sessions: TerminalSession[];
  onToggle: () => void;
  onStop: (sessionId: string) => void;
}

function TerminalPane({ open, onToggle, sessions, onStop }: TerminalPaneProps) {
  return (
    <div className={`terminal ${open ? "open" : "closed"}`}>
      <div className="terminal-header">
        <button className="link" onClick={onToggle}>
          {open ? "▼" : "▲"} Terminal
        </button>
        <span className="terminal-count">{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
      </div>
      {open && (
        <div className="terminal-body">
          {sessions.length === 0 && <p className="terminal-empty">Command output will appear here.</p>}
          {sessions.map((session) => (
            <TerminalSessionItem key={session.sessionId} session={session} onStop={onStop} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SessionProps {
  session: TerminalSession;
  onStop: (sessionId: string) => void;
}

function TerminalSessionItem({ session, onStop }: SessionProps) {
  const bodyRef = useRef<HTMLPreElement>(null);

  const statusLabel = useMemo(() => {
    switch (session.status) {
      case "running":
        return { label: "Running", color: "#ffa502" };
      case "success":
        return { label: "Done", color: "#2ed573" };
      case "error":
      default:
        return { label: `Error${session.exitCode != null ? ` (${session.exitCode})` : ""}`, color: "#ff6b81" };
    }
  }, [session.status, session.exitCode]);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [session.output]);

  return (
    <div className="terminal-session">
      <header>
        <div className="terminal-meta">
          <span className="terminal-command">{session.command}</span>
          <span className="terminal-cwd">{session.cwd}</span>
          <span className="terminal-time">{new Date(session.timestamp).toLocaleTimeString()}</span>
        </div>
        <div className="terminal-controls">
          <span className="status-chip" style={{ backgroundColor: statusLabel.color }}>
            {statusLabel.label}
          </span>
          {session.status === "running" && (
            <button className="danger" onClick={() => onStop(session.sessionId)}>
              Stop
            </button>
          )}
        </div>
      </header>
      <pre ref={bodyRef}>
        {session.output.map((chunk, index) => (
          <span key={index} className={chunk.stream === "stderr" ? "stderr" : "stdout"}>
            {chunk.text}
          </span>
        ))}
      </pre>
    </div>
  );
}

export default TerminalPane;
