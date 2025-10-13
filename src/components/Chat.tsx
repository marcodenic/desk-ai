import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bolt, ShieldAlert, ShieldCheck, Globe2, Settings2, Trash2, Loader2, Terminal } from "lucide-react";

import type { ApprovalRequest, BackendStatus, ChatMessage } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge, type BadgeProps } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Switch } from "./ui/switch";
import { cn } from "../lib/utils";

interface ChatProps {
  messages: ChatMessage[];
  thinking: boolean;
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
  allowSystemWide: boolean;
  onToggleSystemWide: () => void;
}

function Chat({
  messages,
  thinking,
  backendStatus,
  disabled,
  onSend,
  onClear,
  onToggleSettings,
  settingsPanelOpen,
  approvalRequest,
  onApprove,
  onReject,
  autoApproveAll,
  onToggleAutoApprove,
  allowSystemWide,
  onToggleSystemWide,
}: ChatProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const canSend = draft.trim().length > 0 && !disabled && backendStatus === "ready" && !sending;
  const isStreaming = useMemo(() => messages.some((message) => message.streaming), [messages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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

  const statusBadge = (() => {
    switch (backendStatus) {
      case "ready":
        return (
          <Badge variant="success" className="gap-1">
            <Bolt className="h-4 w-4" /> Online
          </Badge>
        );
      case "starting":
        return (
          <Badge variant="warning" className="gap-1">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <ShieldAlert className="h-4 w-4" /> Error
          </Badge>
        );
      default:
        return <Badge variant="outline">Idle</Badge>;
    }
  })();

  const placeholder = backendStatus === "ready"
    ? "Ask the assistant for help…"
    : backendStatus === "starting"
      ? "Testing connection…"
      : "Configure settings to start.";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col bg-background">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">Chat</h1>
            <span className="text-xs text-muted-foreground">
              Ask the assistant to inspect files, edit code, or run shell commands
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-gray-400">Online</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={autoApproveAll}
                onCheckedChange={onToggleAutoApprove}
              />
              <label className="text-xs cursor-pointer" onClick={onToggleAutoApprove}>
                Auto Allow
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={!allowSystemWide}
                onCheckedChange={() => onToggleSystemWide()}
              />
              <label className="text-xs cursor-pointer" onClick={onToggleSystemWide}>
                Workdir Only
              </label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSettings}
              className="h-7 w-7 p-0"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={messages.length === 0}
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Chat
            </Button>
          </div>
        </header>

        <ScrollArea className="subtle-scrollbar flex-1 px-6 py-4">
          <div ref={listRef} className="flex flex-col gap-3">
            {messages.length === 0 && !approvalRequest && !thinking && <EmptyState />}
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {thinking && <ThinkingBubble />}
            {approvalRequest && (
              <ApprovalBubble request={approvalRequest} onApprove={onApprove} onReject={onReject} />
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/40 bg-card/20 p-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Textarea
              value={draft}
              placeholder={placeholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={backendStatus !== "ready" || disabled || sending}
              className="min-h-[90px] resize-none border-border/50 bg-card/50 text-sm shadow-sm"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Press ⌘⏎ / Ctrl⏎ to send</span>
              <Button type="submit" disabled={!canSend} size="sm" className="h-8 gap-1.5 px-4 font-medium">
                {isStreaming || sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface ControlButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tooltip: string;
  label: string;
}

function ControlButton({ active, onClick, icon: Icon, tooltip, label }: ControlButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          onClick={onClick}
          className={cn("gap-1", active ? "shadow-lg shadow-primary/30" : "")}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface MessageProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const timestamp = new Date(message.createdAt).toLocaleTimeString();

  if (isTool) {
    const statusIcon =
      message.toolStatus === "executing" ? "●" : message.toolStatus === "completed" ? "✔" : "✖";
    const statusVariant: BadgeProps["variant"] =
      message.toolStatus === "completed"
        ? "success"
        : message.toolStatus === "failed"
          ? "destructive"
          : "default";
    return (
      <div className="flex items-center gap-2.5 py-1.5">
        <Badge variant={statusVariant} className="gap-1.5 text-xs font-mono">
          {message.toolName}
          <span className="opacity-60">{statusIcon}</span>
        </Badge>
        <span className="text-xs text-muted-foreground">{message.content}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex flex-col gap-1.5 py-1",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        <span>{isUser ? "You" : "Assistant"}</span>
        <span className="opacity-50">{timestamp}</span>
      </div>
      <div
        className={cn(
          "max-w-2xl rounded-lg border px-4 py-3 text-sm shadow-sm",
          isUser
            ? "border-primary/30 bg-primary/8"
            : "border-border/50 bg-card/60"
        )}
      >
        <pre className="whitespace-pre-wrap font-sans leading-relaxed">
          {message.content || (message.streaming ? "…" : "")}
        </pre>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Thinking…</span>
    </div>
  );
}

interface ApprovalBubbleProps {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
}

function ApprovalBubble({ request, onApprove, onReject }: ApprovalBubbleProps) {
  return (
    <div className="my-2 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <ShieldAlert className="h-4 w-4" />
        Approval required
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{formatAction(request.action)}</p>
        {request.command && (
          <code className="block rounded-md border border-amber-500/20 bg-black/20 px-3 py-2 text-xs font-mono">
            {request.command}
          </code>
        )}
        {request.path && (
          <code className="block rounded-md border border-amber-500/20 bg-black/20 px-3 py-2 text-xs font-mono">
            {request.path}
          </code>
        )}
        {request.description && (
          <p className="text-xs text-muted-foreground">{request.description}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onReject} className="h-8 text-xs font-medium">
          Deny
        </Button>
        <Button size="sm" onClick={onApprove} className="h-8 bg-amber-500 text-black hover:bg-amber-400 font-medium">
          Allow
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-full bg-primary/10 p-4 shadow-lg shadow-primary/10">
        <Bolt className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">Start a conversation</p>
        <p className="text-sm text-muted-foreground">
          Let the assistant explore your project and automate workflows.
        </p>
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
