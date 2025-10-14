import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import SettingsPanel from "./components/SettingsPanel";
import Chat from "./components/Chat";
import type {
  ApprovalRequest,
  BackendEvent,
  BackendStatus,
  ChatMessage,
  Settings,
  ShellDataEvent,
  ShellEndEvent,
  ShellStartEvent,
  StatusEvent,
  TerminalSession,
  ToolRequestPayload,
  ToolCallStartEvent,
  ToolCallEndEvent,
} from "./types";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";

const DEFAULT_SETTINGS: Settings = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
  workdir: "",
  autoApproveReads: true,
  confirmWrites: true,
  confirmShell: true,
  showTerminalOnCommand: true,
  autoApproveAll: false,
  allowSystemWide: false,
  showCommandOutput: true,
  allowElevatedCommands: false,
};

const SETTINGS_STORAGE_KEY = "desk-ai::settings";

function formatToolCall(name: string, args: Record<string, any>): string {
  const argParts: string[] = [];
  
  if (name === "run_shell" && args.command) {
    return `Running: ${args.command}`;
  } else if (name === "read_file" && args.path) {
    return `Reading file: ${args.path}`;
  } else if (name === "write_file" && args.path) {
    return `Writing file: ${args.path}`;
  } else if (name === "list_directory" && args.path) {
    return `Listing directory: ${args.path || "."}`;
  } else if (name === "delete_path" && args.path) {
    return `Deleting: ${args.path}`;
  }
  
  // Fallback for unknown tools
  for (const [key, value] of Object.entries(args)) {
    if (value) {
      argParts.push(`${key}=${String(value).substring(0, 50)}`);
    }
  }
  return `${name}(${argParts.join(", ")})`;
}

function loadInitialSettings(): Settings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.warn("Failed to load settings", error);
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings): void {
  const payload: Settings = {
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    workdir: settings.workdir,
    autoApproveReads: settings.autoApproveReads,
    confirmWrites: settings.confirmWrites,
    confirmShell: settings.confirmShell,
    showTerminalOnCommand: settings.showTerminalOnCommand,
    autoApproveAll: settings.autoApproveAll,
    allowSystemWide: settings.allowSystemWide,
    showCommandOutput: settings.showCommandOutput,
    allowElevatedCommands: settings.allowElevatedCommands,
  };

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

function App() {
  const [settings, setSettings] = useState<Settings>(() => loadInitialSettings());
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("idle");
  const [backendStatusMessage, setBackendStatusMessage] = useState<string>();
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingCredentials, setTestingCredentials] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  // Only open settings panel if no settings exist yet
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(() => {
    const hasValidSettings = settings.apiKey && settings.workdir;
    return !hasValidSettings;
  });

  const settingsRef = useRef<Settings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    saveSettings(settings);
  }, [
    settings.provider,
    settings.apiKey,
    settings.model,
    settings.workdir,
    settings.autoApproveReads,
    settings.confirmWrites,
    settings.confirmShell,
    settings.showTerminalOnCommand,
    settings.allowSystemWide,
  ]);

  // Register event listeners on mount (once)
  useEffect(() => {
    const unlistenFns: UnlistenFn[] = [];

    async function setupListeners() {
      const register = async <T extends BackendEvent>(name: string, handler: (payload: T) => void) => {
        const unlisten = await listen<T>(name, (event) => handler(event.payload));
        unlistenFns.push(unlisten);
      };

      await register<StatusEvent>("backend://status", handleStatusEvent);
      await register<ToolRequestPayload>("backend://tool_request", handleToolRequest);
      await register<ShellStartEvent>("backend://shell_start", handleShellStart);
      await register<ShellDataEvent>("backend://shell_data", handleShellData);
      await register<ShellEndEvent>("backend://shell_end", handleShellEnd);
      await register<BackendEvent>("backend://token", handleToken);
      await register<BackendEvent>("backend://final", handleFinal);
      await register<BackendEvent>("backend://error", handleBackendError);
      await register<BackendEvent>("backend://tool_log", handleToolLog);
      await register<ToolCallStartEvent>("backend://tool_call_start", handleToolCallStart);
      await register<ToolCallEndEvent>("backend://tool_call_end", handleToolCallEnd);
      await register<BackendEvent>("backend://stderr", handleBackendStderr);
      await register<BackendEvent>("backend://exit", handleBackendExit);
      
      console.log("[App] Event listeners registered");
    }

    setupListeners().catch((error) => {
      console.error("Failed to register backend listeners", error);
    });

    return () => {
      unlistenFns.forEach((unlisten) => unlisten());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Handlers are stable via useCallback, only register once

  // Auto-start backend after a small delay to ensure listeners are ready
  useEffect(() => {
    const hasValidSettings = settings.apiKey && settings.workdir;
    if (hasValidSettings && backendStatus === "idle") {
      // Small delay to ensure event listeners are registered first
      const timer = setTimeout(() => {
        console.log("[App] Auto-starting backend with saved settings");
        handleSaveSettings();
      }, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount with initial values

  const handleStatusEvent = useCallback((payload: StatusEvent) => {
    console.log("[DEBUG App.tsx] handleStatusEvent called with:", payload);
    
    // Clear the safety timeout if it exists
    const timeoutId = (window as any).__savingConfigTimeout;
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete (window as any).__savingConfigTimeout;
    }
    
    switch (payload.status) {
      case "starting":
        console.log("[DEBUG App.tsx] Setting status to starting");
        setBackendStatus("starting");
        break;
      case "ready":
        console.log("[DEBUG App.tsx] Setting status to ready, clearing savingConfig");
        setBackendStatus("ready");
        setSettingsPanelOpen(false); // Hide settings when backend is ready
        setSavingConfig(false); // Clear saving state when backend is ready
        break;
      case "error":
      default:
        console.log("[DEBUG App.tsx] Setting status to error");
        setBackendStatus("error");
        setSavingConfig(false); // Clear saving state on error
        break;
    }
    setBackendStatusMessage(payload.message);
    if (payload.status === "error") {
      console.error("Backend status error:", payload.message);
    }
  }, []);

  const handleToolRequest = useCallback((payload: ToolRequestPayload) => {
    if (payload.autoApproved) {
      return;
    }
    
    // Auto-approve if the global setting is enabled
    if (settingsRef.current.autoApproveAll) {
      const request: ApprovalRequest = {
        requestId: payload.requestId,
        action: payload.action,
        path: payload.path,
        command: payload.command,
        description: payload.description,
        bytes: payload.bytes,
      };
      resolveApproval(request, true);
      return;
    }
    
    const request: ApprovalRequest = {
      requestId: payload.requestId,
      action: payload.action,
      path: payload.path,
      command: payload.command,
      description: payload.description,
      bytes: payload.bytes,
    };
    setApprovals((current) => [...current, request]);
  }, []);

  const handleShellStart = useCallback((payload: ShellStartEvent) => {
    setTerminalSessions((current) => [
      ...current.slice(-19),
      {
        sessionId: payload.sessionId,
        command: payload.cmd,
        cwd: payload.cwd,
        timestamp: payload.ts,
        output: [],
        status: "running",
        exitCode: null,
      },
    ]);

    // Link the session to the most recent run_shell tool message
    setMessages((current) => {
      const reversed = [...current].reverse();
      const toolMessageIndex = reversed.findIndex(
        (msg) => msg.role === "tool" && msg.toolName === "run_shell" && !msg.sessionId
      );
      
      if (toolMessageIndex === -1) return current;
      
      const actualIndex = current.length - 1 - toolMessageIndex;
      const updated = [...current];
      updated[actualIndex] = {
        ...updated[actualIndex],
        sessionId: payload.sessionId,
      };
      return updated;
    });

    if (settingsRef.current.showTerminalOnCommand) {
      setTerminalOpen(true);
    }
  }, []);

  const handleShellData = useCallback((payload: ShellDataEvent) => {
    setTerminalSessions((current) =>
      current.map((session) =>
        session.sessionId === payload.sessionId
          ? {
              ...session,
              output: [
                ...session.output,
                {
                  stream: payload.stream,
                  text: payload.chunk,
                },
              ],
            }
          : session
      )
    );
  }, []);

  const handleShellEnd = useCallback((payload: ShellEndEvent) => {
    setTerminalSessions((current) =>
      current.map((session) =>
        session.sessionId === payload.sessionId
          ? {
              ...session,
              status: payload.exitCode === 0 || payload.exitCode === null ? "success" : "error",
              exitCode: payload.exitCode,
            }
          : session
      )
    );
  }, []);

  const handleToken = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "token") {
      // First token arrives - stop thinking indicator
      setThinking(false);
      
      setMessages((current) => {
        const next = [...current];
        const index = next.findIndex((message) => message.id === payload.id);
        if (index === -1) {
          next.push({
            id: payload.id,
            role: "assistant",
            content: payload.text,
            streaming: true,
            createdAt: new Date().toISOString(),
          });
          return next;
        }
        const existing = next[index];
        next[index] = {
          ...existing,
          content: `${existing.content}${payload.text}`,
          streaming: true,
        };
        return next;
      });
    }
  }, []);

  const handleFinal = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "final") {
      setMessages((current) =>
        current.map((message) =>
          message.id === payload.id
            ? {
                ...message,
                // Don't overwrite content - it's already been streamed via tokens
                // Just mark as no longer streaming
                streaming: false,
              }
            : message
        )
      );
    }
  }, []);

  const handleBackendError = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "error") {
      const errorMsg = payload.message ?? "Backend error";
      
      // Check if it's an authentication error
      const isAuthError = errorMsg.toLowerCase().includes("401") || 
                         errorMsg.toLowerCase().includes("unauthorized") ||
                         errorMsg.toLowerCase().includes("authentication") ||
                         errorMsg.toLowerCase().includes("invalid api key") ||
                         errorMsg.toLowerCase().includes("incorrect api key");
      
      if (isAuthError) {
        setBackendStatus("starting"); // Use "starting" status for auth errors (will show orange)
        setBackendStatusMessage("Authentication failed - check API key");
      } else {
        setBackendStatus("error");
        setBackendStatusMessage(errorMsg);
      }
      
      // Don't add error to chat if we're just testing credentials
      if (!testingCredentials) {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${errorMsg}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    }
  }, [testingCredentials]);

  const handleToolLog = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "tool_log") {
      setTerminalSessions((current) => [
        ...current.slice(-19),
        {
          sessionId: crypto.randomUUID(),
          command: payload.message,
          cwd: settingsRef.current.workdir || ".",
          timestamp: payload.ts,
          output: [],
          status: "success",
          exitCode: null,
        },
      ]);
      if (settingsRef.current.showTerminalOnCommand) {
        setTerminalOpen(true);
      }
    }
  }, []);

  const handleToolCallStart = useCallback((payload: ToolCallStartEvent) => {
    // Add a tool message to show the tool is being called
    const toolMessage: ChatMessage = {
      id: payload.toolCallId,
      role: "tool",
      content: formatToolCall(payload.name, payload.arguments),
      toolName: payload.name,
      toolArgs: payload.arguments,
      toolStatus: "executing",
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, toolMessage]);
  }, []);

  const handleToolCallEnd = useCallback((payload: ToolCallEndEvent) => {
    // Update the tool message to show completion
    setMessages((current) =>
      current.map((message) =>
        message.id === payload.toolCallId
          ? {
              ...message,
              toolStatus: payload.error ? "failed" : "completed",
              content: payload.error 
                ? `${message.content} - ${payload.error}`
                : message.content,
            }
          : message
      )
    );
  }, []);

  const handleBackendStderr = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "stderr") {
      setBackendStatusMessage(payload.message);
      console.warn("[backend stderr]", payload.message);
    }
  }, []);

  const handleBackendExit = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "exit") {
      setBackendStatus(payload.code === 0 ? "idle" : "error");
      setBackendStatusMessage("Backend exited.");
    }
  }, []);

  const handleSettingsChange = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...changes }));
  }, []);

  const handleSelectDirectory = useCallback(async () => {
    try {
      const selected = (await invoke<string | null>("select_working_directory")) ?? "";
      if (selected) {
        setSettings((current) => ({ ...current, workdir: selected }));
      }
    } catch (error) {
      console.error("Failed to pick directory", error);
      setBackendStatus("error");
      setBackendStatusMessage("Failed to select directory");
    }
  }, []);

  const handleSaveSettings = useCallback(async () => {
    if (!settings.apiKey || !settings.workdir) {
      setBackendStatus("error");
      setBackendStatusMessage("API key and working directory are required.");
      return;
    }

    setSavingConfig(true);
    setBackendStatus("starting");
    setBackendStatusMessage("Configuring backend…");

    // Safety timeout: clear saving state after 5 seconds if no status event received
    const timeoutId = setTimeout(() => {
      console.warn("[App] Status event timeout - clearing savingConfig state");
      setSavingConfig(false);
    }, 5000);

    try {
      // Check if backend is running by checking status
      const isBackendRunning = backendStatus === "ready" || backendStatus === "starting";
      
      if (isBackendRunning) {
        // Backend is running, just update config
        await invoke("update_backend_config", {
          config: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model,
            workdir: settings.workdir,
            autoApproveReads: settings.autoApproveReads,
            confirmWrites: settings.confirmWrites,
            confirmShell: settings.confirmShell,
            showTerminalOnCommand: settings.showTerminalOnCommand,
            allowSystemWide: settings.allowSystemWide,
            showCommandOutput: settings.showCommandOutput,
            allowElevatedCommands: settings.allowElevatedCommands,
          },
        });
        setBackendStatusMessage("Configuration updated");
      } else {
        // Backend not running, start it
        await invoke("start_backend", {
          config: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model,
            workdir: settings.workdir,
            autoApproveReads: settings.autoApproveReads,
            confirmWrites: settings.confirmWrites,
            confirmShell: settings.confirmShell,
            showTerminalOnCommand: settings.showTerminalOnCommand,
            allowSystemWide: settings.allowSystemWide,
            showCommandOutput: settings.showCommandOutput,
            allowElevatedCommands: settings.allowElevatedCommands,
          },
        });
        setBackendStatusMessage("Backend started");
      }
      
      // Backend will emit status events - we'll wait for them
      // The handleStatusEvent will clear savingConfig and timeoutId
      // Store timeout ID so it can be cleared by event handler
      (window as any).__savingConfigTimeout = timeoutId;
    } catch (error) {
      console.error("Failed to configure backend", error);
      setBackendStatus("error");
      setBackendStatusMessage(error instanceof Error ? error.message : "Failed to configure backend");
      setSavingConfig(false);
      clearTimeout(timeoutId);
    }
  }, [settings, backendStatus]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      const now = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: now,
      };
      setMessages((current) => [...current, userMessage]);
      
      // Set thinking state - will be cleared when first token arrives
      setThinking(true);

      try {
        await invoke<string>("send_agent_message", { message: content });
        // Don't pre-create assistant message anymore
        // It will be created when the first token arrives
      } catch (error) {
        console.error("Failed to send message", error);
        setThinking(false);
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    },
    []
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const handleStopAssistant = useCallback(async () => {
    try {
      // Stop the API call by stopping the backend process
      await invoke("stop_agent_message");
      
      // Update UI immediately
      setThinking(false);
      setMessages((current) =>
        current.map((message) =>
          message.streaming 
            ? { ...message, streaming: false, content: message.content + " [Stopped]" }
            : message
        )
      );
      
      // Restart the backend automatically
      setBackendStatus("starting");
      await invoke("start_backend", {
        config: {
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          workdir: settings.workdir,
          autoApproveReads: settings.autoApproveReads,
          confirmWrites: settings.confirmWrites,
          confirmShell: settings.confirmShell,
          allowSystemWide: settings.allowSystemWide,
        },
      });
      
      console.log("Assistant stopped and backend restarted");
    } catch (error) {
      console.error("Failed to stop assistant:", error);
      setBackendStatus("error");
      setBackendStatusMessage("Failed to stop and restart backend");
    }
  }, [settings]);

  const resolveApproval = useCallback(
    async (request: ApprovalRequest, approved: boolean) => {
      console.log("=== resolveApproval called ===", { request, approved });
      try {
        await invoke("approve_tool", {
          requestId: request.requestId,
          approved,
        });
        setApprovals((current) => current.filter((item) => item.requestId !== request.requestId));
      } catch (error) {
        console.error("Failed to reply to approval request", error);
        setBackendStatus("error");
        setBackendStatusMessage("Failed to send approval response.");
      }
    },
    []
  );

  const handleApproveFromChat = useCallback(() => {
    console.log("=== handleApproveFromChat called ===");
    const request = approvals[0];
    if (request) {
      resolveApproval(request, true);
    }
  }, [approvals, resolveApproval]);

  const handleRejectFromChat = useCallback(() => {
    console.log("=== handleRejectFromChat called ===");
    const request = approvals[0];
    if (request) {
      resolveApproval(request, false);
    }
  }, [approvals, resolveApproval]);

  const handleStopSession = useCallback(async (sessionId: string) => {
    try {
      await invoke("kill_command", { sessionId });
    } catch (error) {
      console.error("Failed to kill command", error);
      setBackendStatus("error");
      setBackendStatusMessage("Failed to stop command.");
    }
  }, []);

  const activeApproval = approvals[0] ?? null;
  const chatDisabled = backendStatus !== "ready";

  const assistantStreaming = useMemo(
    () => messages.some((message) => message.role === "assistant" && message.streaming),
    [messages]
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background lg:flex-row">
      {settingsPanelOpen && (
        <div className="w-full border-b border-border/40 lg:w-72 lg:border-b-0 lg:border-r">
          <SettingsPanel
            settings={settings}
            backendStatus={backendStatus}
            statusMessage={backendStatusMessage}
            saving={savingConfig}
            onChange={handleSettingsChange}
            onSave={handleSaveSettings}
            onSelectDirectory={handleSelectDirectory}
          />
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Chat
          messages={messages}
          thinking={thinking}
          backendStatus={backendStatus}
          disabled={chatDisabled || assistantStreaming}
          onSend={handleSendMessage}
          onStop={handleStopAssistant}
          onClear={handleClearChat}
          onToggleSettings={() => setSettingsPanelOpen((prev) => !prev)}
          settingsPanelOpen={settingsPanelOpen}
          approvalRequest={approvals[0] || null}
          onApprove={handleApproveFromChat}
          onReject={handleRejectFromChat}
          autoApproveAll={settings.autoApproveAll}
          onToggleAutoApprove={() =>
            setSettings((prev) => ({ ...prev, autoApproveAll: !prev.autoApproveAll }))
          }
          allowSystemWide={settings.allowSystemWide}
          onToggleSystemWide={() =>
            setSettings((prev) => ({ ...prev, allowSystemWide: !prev.allowSystemWide }))
          }
          terminalSessions={terminalSessions}
          showCommandOutput={settings.showCommandOutput}
        />
      </div>
    </div>
  );
}

export default App;
