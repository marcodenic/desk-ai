export type Provider = "openai" | "anthropic";

export interface ModelOption {
  id: string;
  name: string;
  provider: Provider;
  contextWindow?: number;
  description?: string;
}

export interface Settings {
  provider: Provider;
  apiKey: string;
  model: string;
  workdir: string;
  autoApproveReads: boolean;
  confirmWrites: boolean;
  confirmShell: boolean;
  autoApproveAll: boolean;
  showTerminalOnCommand: boolean;
  allowSystemWide: boolean;
  showCommandOutput: boolean;
}

export type BackendStatus = "idle" | "starting" | "ready" | "error";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  pending?: boolean;
  streaming?: boolean;
  createdAt: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolStatus?: "pending" | "executing" | "completed" | "failed";
  sessionId?: string; // Link to terminal session for shell commands
}

export type ToolAction = "shell" | "read" | "write" | "delete" | "list";

export interface ToolRequestPayload {
  type: "tool_request";
  requestId: string;
  action: ToolAction;
  path?: string;
  command?: string;
  description?: string;
  bytes?: number;
  autoApproved?: boolean;
}

export interface TokenEvent {
  type: "token";
  id: string;
  text: string;
}

export interface FinalEvent {
  type: "final";
  id: string;
  text: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  raw?: string;
}

export interface StatusEvent {
  type: "status";
  status: "starting" | "ready" | "error";
  message?: string;
}

export interface ShellStartEvent {
  type: "shell_start";
  sessionId: string;
  cmd: string;
  cwd: string;
  ts: string;
}

export interface ShellDataEvent {
  type: "shell_data";
  sessionId: string;
  chunk: string;
  stream: "stdout" | "stderr";
}

export interface ShellEndEvent {
  type: "shell_end";
  sessionId: string;
  exitCode: number | null;
  durationMs?: number;
}

export interface ToolCallStartEvent {
  type: "tool_call_start";
  toolCallId: string;
  name: string;
  arguments: Record<string, any>;
  promptId: string;
}

export interface ToolCallEndEvent {
  type: "tool_call_end";
  toolCallId: string;
  result: string;
  error?: string;
}

export type BackendEvent =
  | ToolRequestPayload
  | TokenEvent
  | FinalEvent
  | ErrorEvent
  | StatusEvent
  | ShellStartEvent
  | ShellDataEvent
  | ShellEndEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | { type: "tool_log"; message: string; ts: string }
  | { type: "stderr"; message: string }
  | { type: "exit"; code: number | null; signal: number | null };

export interface ApprovalRequest {
  requestId: string;
  action: ToolAction;
  path?: string;
  command?: string;
  description?: string;
  bytes?: number;
  autoApproved?: boolean;
}

export type TerminalStream = "stdout" | "stderr";

export interface TerminalChunk {
  stream: TerminalStream;
  text: string;
}

export interface TerminalSession {
  sessionId: string;
  command: string;
  cwd: string;
  timestamp: string;
  output: TerminalChunk[];
  status: "running" | "success" | "error";
  exitCode: number | null;
}
