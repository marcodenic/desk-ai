import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bolt, ShieldAlert, ShieldCheck, Globe2, Settings2, Trash2, Loader2, Terminal, ArrowDown, Square, Maximize2, Minimize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import type { ApprovalRequest, BackendStatus, ChatMessage, TerminalSession } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge, type BadgeProps } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Switch } from "./ui/switch";
import { cn } from "../lib/utils";
import { StatusIndicator, type StatusType } from "./StatusIndicator";

interface ChatProps {
  messages: ChatMessage[];
  thinking: boolean;
  backendStatus: BackendStatus;
  aiStatus: StatusType;
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
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
  terminalSessions: TerminalSession[];
  showCommandOutput: boolean;
  popupMode?: boolean;
}

function Chat({
  messages,
  thinking,
  backendStatus,
  aiStatus,
  disabled,
  onSend,
  onStop,
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
  terminalSessions,
  showCommandOutput,
  popupMode = false,
}: ChatProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = draft.trim().length > 0 && !disabled && backendStatus === "ready" && !sending;
  const isStreaming = useMemo(() => messages.some((message) => message.streaming), [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Reset height to recalculate
    textarea.style.height = 'auto';
    // Set to scrollHeight but respect max-height
    const maxHeight = window.innerHeight * 0.3; // 30vh
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  }, [draft]);

  // Listen for focus-input event from global shortcut
  useEffect(() => {
    const unlisten = listen('focus-input', () => {
      textareaRef.current?.focus();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Auto-scroll to bottom when messages change, but only if autoScroll is enabled
  useEffect(() => {
    if (!autoScroll && !popupMode) return; // Always auto-scroll in popup mode
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, approvalRequest, autoScroll, popupMode]);

  // Force scroll to bottom when entering popup mode
  useEffect(() => {
    if (popupMode) {
      const viewport = viewportRef.current;
      if (viewport) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
        }, 100);
      }
      setAutoScroll(true); // Enable auto-scroll in popup mode
    }
  }, [popupMode]);

  // Check scroll position to show/hide scroll button and update autoScroll
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      
      setShowScrollButton(!isAtBottom);
      setAutoScroll(isAtBottom);
    };

    viewport.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state

    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    setAutoScroll(true);
    setShowScrollButton(false);
  }, []);

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

  const placeholder = backendStatus === "ready"
    ? "Ask the assistant for help… (⌘⏎ / Ctrl⏎ to send)"
    : backendStatus === "starting"
      ? "Testing connection…"
      : "Configure settings to start.";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col bg-background">
        {popupMode ? (
          <header className="flex items-center justify-between border-b border-border px-3 py-2 bg-card/50">
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-semibold">DESK AI</h1>
              <StatusIndicator status={aiStatus} compact />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await invoke("toggle_window_mode", { popupMode: false });
                  } catch (error) {
                    console.error("Failed to toggle window mode:", error);
                  }
                }}
                className="h-6 w-6 p-0"
                title="Expand to full mode"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={messages.length === 0}
                className="h-6 w-6 p-0"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </header>
        ) : (
          <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3 min-h-[53px]">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold">DESK AI</h1>
              <span className="text-xs text-muted-foreground">
                super power your desktop
              </span>
            </div>
            <StatusIndicator status={aiStatus} compact />
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await invoke("toggle_window_mode", { popupMode: true });
                  } catch (error) {
                    console.error("Failed to toggle window mode:", error);
                  }
                }}
                className="h-7 w-7 p-0"
                title="Switch to mini mode"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleSettings}
                className="h-7 w-7 p-0"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoApproveAll}
                  onCheckedChange={onToggleAutoApprove}
                />
                <label className="text-xs cursor-pointer" onClick={onToggleAutoApprove}>
                  {autoApproveAll ? "Auto Allow" : "Manual Approve"}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={allowSystemWide}
                  onCheckedChange={() => onToggleSystemWide()}
                  disabled={backendStatus !== "ready"}
                />
                <label className="text-xs cursor-pointer" onClick={onToggleSystemWide}>
                  {allowSystemWide ? "System Wide" : "Workdir Only"}
                </label>
              </div>
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
        )}

        <div className="relative flex-1 overflow-hidden">
          <ScrollArea 
            viewportRef={viewportRef}
            className={cn("subtle-scrollbar h-full", popupMode ? "px-3 py-2" : "px-6 py-4")}
          >
            <div 
              ref={listRef}
              className="flex flex-col gap-3"
            >
              {messages.length === 0 && !approvalRequest && !thinking && <EmptyState />}
              {messages.map((message) => (
                <MessageBubble 
                  key={message.id} 
                  message={message} 
                  terminalSessions={terminalSessions}
                  showCommandOutput={showCommandOutput}
                  popupMode={popupMode}
                />
              ))}
              {thinking && <ThinkingBubble />}
              {approvalRequest && (
                <ApprovalBubble request={approvalRequest} onApprove={onApprove} onReject={onReject} />
              )}
            </div>
          </ScrollArea>
          
          {showScrollButton && (
            <Button
              onClick={scrollToBottom}
              size="sm"
              className="absolute bottom-6 right-6 h-9 w-9 rounded-full p-0 shadow-lg z-10"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className={cn("border-t border-border/40 bg-card/20", popupMode ? "px-3 py-2" : "px-4 py-3")}>
          <form onSubmit={handleSubmit} className="relative">
            <Textarea
              ref={textareaRef}
              value={draft}
              placeholder={placeholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={backendStatus !== "ready" || disabled || sending}
              className={cn(
                "resize-none border-border/50 bg-card/50 text-sm shadow-sm pr-12 overflow-y-auto",
                popupMode ? "min-h-[60px] max-h-[25vh] py-2" : "min-h-[88px] max-h-[30vh] py-2.5"
              )}
              rows={popupMode ? 2 : 2}
            />
            {isStreaming || sending || thinking ? (
              <Button 
                type="button" 
                onClick={onStop} 
                size="sm" 
                variant="destructive"
                className={cn("absolute right-2 p-0 shrink-0", popupMode ? "bottom-2 h-8 w-8" : "bottom-2 h-10 w-10")}
              >
                <Square className={popupMode ? "h-4 w-4" : "h-5 w-5"} />
              </Button>
            ) : (
              <Button 
                type="submit" 
                disabled={!canSend} 
                size="sm" 
                className={cn("absolute right-2 p-0 shrink-0", popupMode ? "bottom-2 h-8 w-8" : "bottom-2 h-10 w-10")}
                style={{ backgroundColor: 'white', color: 'black' }}
              >
                <svg className={popupMode ? "h-4 w-4" : "h-5 w-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </Button>
            )}
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
  terminalSessions: TerminalSession[];
  showCommandOutput: boolean;
  popupMode?: boolean;
}

function MessageBubble({ message, terminalSessions, showCommandOutput, popupMode = false }: MessageProps) {
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
    
    // Extract command from content like "Running: df -h"
    const content = message.content;
    const commandMatch = content.match(/^Running: (.+)$/);
    
    if (commandMatch && message.toolName === "run_shell") {
      const command = commandMatch[1];
      const isCompleted = message.toolStatus === "completed";
      const isFailed = message.toolStatus === "failed";
      
      // Find the corresponding terminal session
      const session = message.sessionId 
        ? terminalSessions.find(s => s.sessionId === message.sessionId)
        : null;
      
      return (
        <div className="flex flex-col gap-2 py-1.5">
          <div className={cn(
            "flex gap-2.5",
            popupMode ? "flex-col items-start" : "items-start"
          )}>
            <div className={cn(
              "flex items-center gap-2 py-1.5 px-3 rounded-full border shrink-0",
              isCompleted && "bg-green-500/10 border-green-500/30",
              isFailed && "bg-red-500/10 border-red-500/30",
              !isCompleted && !isFailed && "bg-yellow-500/10 border-yellow-500/30"
            )}>
              <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">run_shell</span>
              <span className={cn(
                "text-xs shrink-0",
                isCompleted && "text-green-500",
                isFailed && "text-red-500",
                !isCompleted && !isFailed && "text-yellow-500"
              )}>
                {statusIcon}
              </span>
            </div>
            <code className={cn(
              "font-mono text-xs text-muted-foreground break-all",
              popupMode ? "pt-0" : "pt-2"
            )}>$ {command}</code>
          </div>
          
          {/* Display terminal output if available and enabled */}
          {showCommandOutput && session && session.output.length > 0 && (
            <div className="ml-0 mt-1 rounded-md bg-muted/30 border border-muted-foreground/20 p-3 font-mono text-xs overflow-x-auto">
              {session.output.map((chunk, idx) => (
                <span
                  key={idx}
                  className={cn(
                    chunk.stream === "stderr" && "text-red-400"
                  )}
                >
                  {chunk.text}
                </span>
              ))}
              {session.exitCode !== null && (
                <div className={cn(
                  "mt-2 pt-2 border-t border-muted-foreground/20 text-xs",
                  session.exitCode === 0 ? "text-green-500" : "text-red-500"
                )}>
                  Exit code: {session.exitCode}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    
    // Other tool types
    const otherMatch = content.match(/^(Reading file|Writing file|Listing directory|Deleting): (.+)$/);
    
    return (
      <div className="flex items-center gap-2.5 py-1.5">
        <Badge variant={statusVariant} className="gap-1.5 text-xs font-mono">
          {message.toolName}
          <span className="opacity-60">{statusIcon}</span>
        </Badge>
        {otherMatch ? (
          <span className="text-xs text-muted-foreground">
            {otherMatch[1]}: <code className="font-mono text-xs bg-muted/50 px-1 py-0.5 rounded">{otherMatch[2]}</code>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{content}</span>
        )}
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
            ? "border-white/20 bg-white text-black"
            : "border-border/50 bg-card/60"
        )}
      >
        {isUser ? (
          <pre className="whitespace-pre-wrap font-sans leading-relaxed">
            {message.content || (message.streaming ? "…" : "")}
          </pre>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                h1: ({ node, ...props }) => (
                  <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0" {...props} />
                ),
                h2: ({ node, ...props }) => (
                  <h2 className="text-lg font-semibold mb-2 mt-3 first:mt-0" {...props} />
                ),
                h3: ({ node, ...props }) => (
                  <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0" {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul className="list-disc list-inside mb-3 space-y-1" {...props} />
                ),
                ol: ({ node, ...props }) => (
                  <ol className="list-decimal list-inside mb-3 space-y-1" {...props} />
                ),
                li: ({ node, ...props }) => (
                  <li className="leading-relaxed" {...props} />
                ),
                p: ({ node, ...props }) => (
                  <p className="mb-3 last:mb-0 leading-relaxed" {...props} />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote className="border-l-4 border-primary/50 pl-4 italic my-3" {...props} />
                ),
                hr: ({ node, ...props }) => (
                  <hr className="border-t border-border/50 my-4" {...props} />
                ),
                a: ({ node, ...props }) => (
                  <a className="text-primary hover:underline" {...props} />
                ),
                strong: ({ node, ...props }) => (
                  <strong className="font-bold" {...props} />
                ),
                em: ({ node, ...props }) => (
                  <em className="italic" {...props} />
                ),
                pre: ({ node, ...props }) => (
                  <pre className="bg-black/30 rounded p-3 overflow-x-auto my-3" {...props} />
                ),
                code: ({ node, className, children, ...props }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-muted/50 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content || (message.streaming ? "…" : "")}
            </ReactMarkdown>
          </div>
        )}
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
