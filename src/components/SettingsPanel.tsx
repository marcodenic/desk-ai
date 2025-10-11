import { useMemo } from "react";
import type { BackendStatus, Provider, Settings } from "../types";

interface SettingsPanelProps {
  settings: Settings;
  backendStatus: BackendStatus;
  statusMessage?: string;
  saving: boolean;
  onChange: (changes: Partial<Settings>) => void;
  onSave: () => void;
  onSelectDirectory: () => void;
}

const providerOptions: Array<{ id: Provider; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic Claude" },
];

function SettingsPanel({
  settings,
  backendStatus,
  statusMessage,
  saving,
  onChange,
  onSave,
  onSelectDirectory,
}: SettingsPanelProps) {
  const statusColor = useMemo(() => {
    switch (backendStatus) {
      case "ready":
        return "#2ed573";
      case "error":
        return "#ff6b81";
      case "starting":
        return "#ffa502";
      default:
        return "#8a92a6";
    }
  }, [backendStatus]);

  return (
    <aside className="settings-panel">
      <div className="panel-header">
        <div>
          <h2>Settings</h2>
          <p className="panel-description">
            Configure the model provider, API key, and working directory.
          </p>
        </div>
        <div className="status-indicator" style={{ color: statusColor }}>
          <span className="dot" style={{ backgroundColor: statusColor }} />
          <span className="label">{backendStatus === "idle" ? "Idle" : backendStatus === "starting" ? "Testing…" : backendStatus === "ready" ? "Ready" : "Error"}</span>
        </div>
      </div>

      {statusMessage && (
        <div className="status-message">{statusMessage}</div>
      )}

      <div className="form-group">
        <label htmlFor="provider">Provider</label>
        <select
          id="provider"
          value={settings.provider}
          onChange={(event) => onChange({ provider: event.target.value as Provider })}
        >
          {providerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="model">Model</label>
        <input
          id="model"
          type="text"
          value={settings.model}
          onChange={(event) => onChange({ model: event.target.value })}
          placeholder={settings.provider === "openai" ? "gpt-4o-mini" : "claude-3-5-sonnet-latest"}
        />
      </div>

      <div className="form-group">
        <label htmlFor="apiKey">API Key</label>
        <input
          id="apiKey"
          type="password"
          value={settings.apiKey}
          onChange={(event) => onChange({ apiKey: event.target.value })}
          placeholder={settings.provider === "openai" ? "sk-…" : "anthropic-…"}
          autoComplete="off"
        />
      </div>

      <div className="form-group">
        <label>Working Directory</label>
        <div className="directory-row">
          <div className="directory-path">
            {settings.workdir ? settings.workdir : "No directory selected"}
          </div>
          <button className="secondary" onClick={onSelectDirectory}>
            Choose…
          </button>
        </div>
      </div>

      <div className="toggle-group">
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.autoApproveReads}
            onChange={(event) => onChange({ autoApproveReads: event.target.checked })}
          />
          <span>Auto-approve non-destructive reads</span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.confirmWrites}
            onChange={(event) => onChange({ confirmWrites: event.target.checked })}
          />
          <span>Confirm writes & deletes</span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.confirmShell}
            onChange={(event) => onChange({ confirmShell: event.target.checked })}
          />
          <span>Confirm shell commands</span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showTerminalOnCommand}
            onChange={(event) => onChange({ showTerminalOnCommand: event.target.checked })}
          />
          <span>Show terminal drawer on command start</span>
        </label>
      </div>

      <button className="primary" onClick={onSave} disabled={saving}>
        {saving ? "Testing…" : "Save & Test"}
      </button>
    </aside>
  );
}

export default SettingsPanel;
