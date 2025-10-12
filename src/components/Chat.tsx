import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRequest, BackendStatus, ChatMessage } from "../types";

interface ChatProps {
  messages: ChatMessage[];
  backendStatus: BackendStatus;
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
  onClear: () => void;
  onToggleSettings: () => void;
  settingsPanelOpen: boolean;
  approvalRequest: ApprovalRequest | null;
  onApprove: () => void;
  onReject: () => void;
  autoApproveAll: boolean;
  onToggleAutoApprove: () => void;
}

function Chat({ messages, backendStatus, disabled, onSend, onClear, onToggleSettings, settingsPanelOpen, approvalRequest, onApprove, onReject, autoApproveAll, onToggleAutoApprove }: ChatProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const canSend = draft.trim().length > 0 && !disabled && backendStatus === "ready" && !sending;
  const isStreaming = useMemo(() => messages.some((message) => message.streaming), [messages]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;

    element.scrollTop = element.scrollHeight;
  }, [messages]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      await sendDraft();
    },
    [draft, canSend]
  );

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        await sendDraft();
      }
    },
    [draft, canSend]
  );

  const sendDraft = useCallback(async () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  }, [draft, canSend, onSend]);

  return (
    <section className="chat-panel">
      <div className="chat-header">
        <div>
          <h2>Chat</h2>
          <p className="chat-description">
            Ask the assistant to inspect files, edit code, or run shell commands in your working directory.
          </p>
        </div>
        <div className="chat-actions">
          <button 
            className={autoApproveAll ? "primary" : "secondary"}
            onClick={onToggleAutoApprove}
            title={autoApproveAll ? "Auto-approve is ON" : "Auto-approve is OFF"}
            style={{ marginRight: '8px' }}
          >
            {autoApproveAll ? "🔓 Auto Allow ON" : "🔒 Auto Allow OFF"}
          </button>
          {!settingsPanelOpen && (
            <button 
              className="secondary" 
              onClick={onToggleSettings}
              title="Show settings"
              style={{ marginRight: '8px' }}
            >
              ⚙️ Settings
            </button>
          )}
          <button className="secondary" onClick={onClear} disabled={messages.length === 0}>
            Clear Chat
          </button>
        </div>
      </div>

      <div className="message-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Start a conversation to let the AI explore your project.</p>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {approvalRequest && (
          <ApprovalBubble 
            request={approvalRequest}
            onApprove={onApprove}
            onReject={onReject}
          />
        )}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          placeholder={backendStatus === "ready" ? "Ask the assistant for help…" : backendStatus === "starting" ? "Testing connection…" : "Configure settings to start."}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={backendStatus !== "ready" || disabled || sending}
          rows={3}
        />
        <div className="composer-footer">
          <span className="hint">Press ⌘⏎ / Ctrl⏎ to send</span>
          <button className="primary" type="submit" disabled={!canSend}>
            {isStreaming ? "Streaming…" : sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface MessageProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const label = isUser ? "You" : isTool ? "Tool" : "Assistant";

  if (isTool) {
    return (
      <div className="message tool">
        <div className="tool-call-chip">
          <span className="tool-icon">
            {message.toolStatus === "executing" ? "⚙️" : message.toolStatus === "completed" ? "✓" : "✗"}
          </span>
          <span className="tool-name">{message.toolName}</span>
          <span className="tool-description">{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`message ${isUser ? "user" : "assistant"}`}>
      <div className="message-meta">
        <span className="message-label">{label}</span>
        <span className="message-time">{new Date(message.createdAt).toLocaleTimeString()}</span>
      </div>
      <div className="message-body">
        <pre>{message.content || (message.streaming ? "…" : "")}</pre>
      </div>
    </div>
  );
}

interface ApprovalBubbleProps {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
}

function ApprovalBubble({ request, onApprove, onReject }: ApprovalBubbleProps) {
  const handleApprove = (e: React.MouseEvent) => {
    console.log("=== APPROVE CLICKED ===");
    console.log("Event:", e);
    console.log("Request:", request);
    e.preventDefault();
    e.stopPropagation();
    onApprove();
  };

  const handleReject = (e: React.MouseEvent) => {
    console.log("=== REJECT CLICKED ===");
    console.log("Event:", e);
    console.log("Request:", request);
    e.preventDefault();
    e.stopPropagation();
    onReject();
  };

  return (
    <div className="message approval">
      <div className="message-meta">
        <span className="message-label">⚠️ Approval Required</span>
      </div>
      <div className="message-body">
        <div className="approval-content">
          <p><strong>{formatAction(request.action)}</strong></p>
          {request.command && <code>{request.command}</code>}
          {request.path && <code>{request.path}</code>}
          {request.description && <p className="approval-description">{request.description}</p>}
        </div>
        <div className="approval-actions">
          <button 
            className="secondary small" 
            onClick={handleReject}
            onMouseDown={(e) => console.log("Deny mousedown", e)}
            onMouseUp={(e) => console.log("Deny mouseup", e)}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
          >
            Deny
          </button>
          <button 
            className="primary small" 
            onClick={handleApprove}
            onMouseDown={(e) => console.log("Allow mousedown", e)}
            onMouseUp={(e) => console.log("Allow mouseup", e)}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

function formatAction(action: ApprovalRequest["action"]) {
  switch (action) {
    case "shell":
      return "Run shell command";
    case "read":
      return "Read file";
    case "write":
      return "Write file";
    case "delete":
      return "Delete file";
    case "list":
      return "List directory";
    default:
      return action;
  }
}

export default Chat;
