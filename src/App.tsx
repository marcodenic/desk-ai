import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import SettingsPanel from "./components/SettingsPanel";
import Chat from "./components/Chat";
import TerminalPane from "./components/TerminalPane";
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
} from "./types";

const DEFAULT_SETTINGS: Settings = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
  workdir: "",
  autoApproveReads: true,
  confirmWrites: true,
  confirmShell: true,
  showTerminalOnCommand: true,
};

const SETTINGS_STORAGE_KEY = "desk-ai::settings";

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
  };

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

function App() {
  const [settings, setSettings] = useState<Settings>(() => loadInitialSettings());
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("idle");
  const [backendStatusMessage, setBackendStatusMessage] = useState<string>();
  const [savingConfig, setSavingConfig] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(true);

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
  ]);

  // Auto-start backend if settings are already configured
  useEffect(() => {
    const hasValidSettings = settings.apiKey && settings.workdir;
    if (hasValidSettings && backendStatus === "idle") {
      handleSaveSettings();
    }
  }, []); // Run once on mount

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
      await register<BackendEvent>("backend://python_stderr", handlePythonStderr);
      await register<BackendEvent>("backend://exit", handleBackendExit);
    }

    setupListeners().catch((error) => {
      console.error("Failed to register backend listeners", error);
    });

    return () => {
      unlistenFns.forEach((unlisten) => unlisten());
    };
  }, []);

  const handleStatusEvent = useCallback((payload: StatusEvent) => {
    switch (payload.status) {
      case "starting":
        setBackendStatus("starting");
        break;
      case "ready":
        setBackendStatus("ready");
        setSettingsPanelOpen(false); // Hide settings when backend is ready
        break;
      case "error":
      default:
        setBackendStatus("error");
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
                content: payload.text,
                streaming: false,
              }
            : message
        )
      );
    }
  }, []);

  const handleBackendError = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "error") {
      setBackendStatus("error");
      setBackendStatusMessage(payload.message ?? "Backend error");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${payload.message}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, []);

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

  const handlePythonStderr = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "python_stderr") {
      setBackendStatusMessage(payload.message);
      console.warn("[backend stderr]", payload.message);
    }
  }, []);

  const handleBackendExit = useCallback((payload: BackendEvent) => {
    if (payload && typeof payload === "object" && "type" in payload && payload.type === "exit") {
      setBackendStatus(payload.code === 0 ? "idle" : "error");
      setBackendStatusMessage("Python backend exited.");
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
    setBackendStatusMessage("Starting backend…");

    try {
      await invoke("start_python_backend", {
        config: {
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          workdir: settings.workdir,
          autoApproveReads: settings.autoApproveReads,
          confirmWrites: settings.confirmWrites,
          confirmShell: settings.confirmShell,
          showTerminalOnCommand: settings.showTerminalOnCommand,
        },
      });
      setBackendStatusMessage("Testing credentials…");
    } catch (error) {
      console.error("Failed to start backend", error);
      setBackendStatus("error");
      setBackendStatusMessage(error instanceof Error ? error.message : "Failed to start backend");
    } finally {
      setSavingConfig(false);
    }
  }, [settings]);

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

      try {
        const assistantId = (await invoke<string>("send_agent_message", { message: content })).toString();
        setMessages((current) => {
          const exists = current.some((message) => message.id === assistantId);
          if (exists) {
            return current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    streaming: true,
                  }
                : message
            );
          }
          return [
            ...current,
            {
              id: assistantId,
              role: "assistant",
              content: "",
              streaming: true,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      } catch (error) {
        console.error("Failed to send message", error);
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
    <div className="app-container">
      <div className="workspace">
        {settingsPanelOpen && (
          <SettingsPanel
            settings={settings}
            backendStatus={backendStatus}
            statusMessage={backendStatusMessage}
            saving={savingConfig}
            onChange={handleSettingsChange}
            onSave={handleSaveSettings}
            onSelectDirectory={handleSelectDirectory}
          />
        )}
        <Chat
          messages={messages}
          backendStatus={backendStatus}
          disabled={chatDisabled || assistantStreaming}
          onSend={handleSendMessage}
          onClear={handleClearChat}
          onToggleSettings={() => setSettingsPanelOpen((prev) => !prev)}
          settingsPanelOpen={settingsPanelOpen}
          approvalRequest={approvals[0] || null}
          onApprove={handleApproveFromChat}
          onReject={handleRejectFromChat}
        />
      </div>
      <TerminalPane
        open={terminalOpen}
        sessions={terminalSessions}
        onToggle={() => setTerminalOpen((value) => !value)}
        onStop={handleStopSession}
      />
    </div>
  );
}

export default App;
