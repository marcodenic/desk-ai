import { useEffect, useMemo, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, FolderOpen, RefreshCcw, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, FileText } from "lucide-react";

import type { BackendStatus, Provider, Settings } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";

interface SettingsPanelProps {
  settings: Settings;
  backendStatus: BackendStatus;
  statusMessage?: string;
  saving: boolean;
  onChange: (changes: Partial<Settings>) => void;
  onSave: () => void;
  onSelectDirectory: () => void;
  onReset?: () => void;
  className?: string;
}

const providerOptions: Array<{ id: Provider; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic Claude" },
];

interface ModelData {
  id: string;
  name: string;
  tool_call?: boolean;
  [key: string]: unknown;
}

interface ProviderData {
  id: string;
  models: Record<string, ModelData>;
  [key: string]: unknown;
}

async function fetchModels(): Promise<Record<Provider, string[]>> {
  const response = await tauriFetch("https://models.dev/api.json", {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json() as Record<string, ProviderData>;
  const anthropicModels = data.anthropic?.models
    ? Object.values(data.anthropic.models)
        .filter((model) => model.tool_call)
        .map((model) => model.id)
        .sort()
    : [];

  const openaiModels = data.openai?.models
    ? Object.values(data.openai.models)
        .filter((model) => model.tool_call)
        .map((model) => model.id)
        .sort()
    : [];

  return {
    anthropic: anthropicModels,
    openai: openaiModels,
  };
}

function SettingsPanel({
  settings,
  backendStatus,
  statusMessage,
  saving,
  onChange,
  onSave,
  onSelectDirectory,
  onReset,
  className,
}: SettingsPanelProps) {
  const [models, setModels] = useState<Record<Provider, string[]>>({
    anthropic: [],
    openai: [],
  });
  const [loadingModels, setLoadingModels] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [connectionExpanded, setConnectionExpanded] = useState(true);
  const [permissionsExpanded, setPermissionsExpanded] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoadingModels(true);
    setFetchError(null);

    fetchModels()
      .then((fetched) => {
        if (!mounted) return;
        setModels(fetched);
        setLoadingModels(false);
        setFetchError(null); // Clear any errors on success
      })
      .catch((error) => {
        if (!mounted) return;
        // Don't show error in console since it might be spurious
        setFetchError(error instanceof Error ? error.message : "Unknown error");
        setLoadingModels(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const availableModels = useMemo(() => {
    return models[settings.provider] ?? [];
  }, [models, settings.provider]);

  const statusBadge = (() => {
    switch (backendStatus) {
      case "ready":
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-gray-400">Ready</span>
          </div>
        );
      case "starting":
        return (
          <Badge variant="warning" className="gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Error
          </Badge>
        );
      default:
        return <Badge variant="outline">Idle</Badge>;
    }
  })();

  const modelValue = availableModels.includes(settings.model)
    ? settings.model
    : availableModels[0] ?? settings.model;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-black">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 min-h-[53px]">
        <h2 className="text-sm font-medium">Settings</h2>
        {statusBadge}
      </div>

      <ScrollArea className="subtle-scrollbar flex-1 px-4 py-3">
        <div className="space-y-3 pb-3">
        {statusMessage && backendStatus === "ready" && (
          <div className="flex items-center gap-2 rounded border border-green-500/50 bg-green-500/10 px-2.5 py-1.5 text-xs text-green-400">
            <span>✓</span>
            <span>{statusMessage}</span>
          </div>
        )}
        {statusMessage && backendStatus === "error" && (
          <div className="rounded border border-red-600 bg-red-950/50 px-2.5 py-1.5 text-xs text-red-400">
            {statusMessage}
          </div>
        )}
          <div className="space-y-2">
            <button
              onClick={() => setConnectionExpanded(!connectionExpanded)}
              className="flex w-full items-center justify-between text-left hover:text-foreground"
            >
              <h3 className="text-xs font-medium text-foreground">
                Connection
              </h3>
              {connectionExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            {connectionExpanded && (
              <div className="space-y-3 pl-0">
            <div className="space-y-1.5">
              <Label htmlFor="provider" className="text-xs text-muted-foreground">
                Provider
              </Label>
              <Select
                value={settings.provider}
                onValueChange={(value) => onChange({ provider: value as Provider })}
              >
                <SelectTrigger id="provider" className="h-8 text-xs">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id} className="text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="model" className="text-xs text-muted-foreground">
                  Model
                </Label>
                {!loadingModels && availableModels.length > 0 && (
                  <span className="text-[10px] text-gray-500">
                    ({availableModels.length} available)
                  </span>
                )}
              </div>
              {loadingModels ? (
                <div className="flex h-8 items-center justify-center gap-2 rounded border border-border bg-secondary text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading…
                </div>
              ) : fetchError ? (
                <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  Failed to load
                </div>
              ) : (
                <Select value={modelValue} onValueChange={(value) => onChange({ model: value })}>
                  <SelectTrigger id="model" className="h-8 text-xs">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {availableModels.map((modelId) => (
                      <SelectItem key={modelId} value={modelId} className="text-sm">
                        {modelId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="apiKey" className="text-xs text-muted-foreground">
                API Key
              </Label>
              <Input
                id="apiKey"
                type="password"
                value={settings.apiKey}
                onChange={(event) => onChange({ apiKey: event.target.value.trim() })}
                placeholder={settings.provider === "openai" ? "sk-…" : "sk-ant-…"}
                autoComplete="off"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Working Directory</Label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 flex items-center h-8 truncate rounded border border-border bg-secondary px-2 text-xs text-muted-foreground font-mono">
                  {settings.workdir || "No directory"}
                </div>
                <Button
                  variant="outline"
                  onClick={onSelectDirectory}
                  className="h-8 gap-1.5 px-3 text-xs border-border bg-transparent hover:bg-border/20"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Browse
                </Button>
              </div>
            </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setPermissionsExpanded(!permissionsExpanded)}
              className="flex w-full items-center justify-between text-left hover:text-foreground"
            >
              <h3 className="text-xs font-medium text-foreground">
                Permissions
              </h3>
              {permissionsExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            {permissionsExpanded && (
              <div className="space-y-2 pl-0">
            <ToggleRow
              label="Auto-approve non-destructive reads"
              checked={settings.autoApproveReads}
              onCheckedChange={(value) => onChange({ autoApproveReads: value })}
            />
            <ToggleRow
              label="Confirm writes & deletes"
              checked={settings.confirmWrites}
              onCheckedChange={(value) => onChange({ confirmWrites: value })}
            />
                <ToggleRow
                  label="Confirm shell commands"
                  checked={settings.confirmShell}
                  onCheckedChange={(value) => onChange({ confirmShell: value })}
                />
                <ToggleRow
                  label="Show command output in chat"
                  checked={settings.showCommandOutput}
                  onCheckedChange={(value) => onChange({ showCommandOutput: value })}
                />
                <ToggleRow
                  label="Allow elevated commands (sudo/admin)"
                  description="⚠️ Enables commands that require administrator privileges"
                  checked={settings.allowElevatedCommands}
                  onCheckedChange={(value) => onChange({ allowElevatedCommands: value })}
                />
                
                <div className="pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await invoke("open_log_file");
                      } catch (error) {
                        console.error("Failed to open log file:", error);
                        alert(`Failed to open log file: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                    className="w-full h-8 gap-1.5 text-xs border-border bg-transparent hover:bg-border/20"
                  >
                    <FileText className="h-3.5 w-3.5" /> Open Log File
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <Button 
          onClick={onSave} 
          disabled={saving}
          className="w-full h-8 bg-white text-black hover:bg-white/90 font-semibold"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing…
            </>
          ) : (
            <>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Save & Test
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({ label, description, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border bg-transparent transition-colors checked:border-white checked:bg-white hover:border-gray-400"
        />
        <svg
          className="pointer-events-none absolute h-3 w-3 text-black opacity-0 peer-checked:opacity-100"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 3L4.5 8.5L2 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-0">
        <span className="text-xs font-normal text-foreground">{label}</span>
        {description && (
          <span className="text-[11px] text-muted-foreground/70">{description}</span>
        )}
      </div>
    </label>
  );
}

export default SettingsPanel;
