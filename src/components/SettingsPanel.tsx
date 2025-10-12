import { useEffect, useMemo, useState } from "react";
import { fetch as tauriFetch } from '@tauri-apps/api/http';
import type { BackendStatus, Provider, Settings } from "../types";

interface SettingsPanelProps {
  settings: Settings;
  backendStatus: BackendStatus;
  statusMessage?: string;
  saving: boolean;
  onChange: (changes: Partial<Settings>) => void;
  onSave: () => void;
  onSelectDirectory: () => void;
  onReset?: () => void;
}

const providerOptions: Array<{ id: Provider; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic Claude" },
];

interface ModelData {
  id: string;
  name: string;
  tool_call?: boolean;
  [key: string]: any;
}

interface ProviderData {
  id: string;
  models: Record<string, ModelData>;
  [key: string]: any;
}

// Fetch models from models.dev API using Tauri's HTTP client (bypasses CORS)
async function fetchModels(): Promise<Record<Provider, string[]>> {
  console.log('[SettingsPanel] Fetching from models.dev API using Tauri HTTP...');
  
  const response = await tauriFetch<Record<string, ProviderData>>('https://models.dev/api.json', {
    method: 'GET',
    timeout: 30,
  });
  
  console.log('[SettingsPanel] Response status:', response.status);
  const data = response.data;
  console.log('[SettingsPanel] Data received, has anthropic?', 'anthropic' in data);
  console.log('[SettingsPanel] Data received, has openai?', 'openai' in data);
  
  // Extract Anthropic models
  const anthropicModels = data.anthropic?.models 
    ? Object.values(data.anthropic.models)
        .filter(m => m.tool_call === true)
        .map(m => m.id)
        .sort()
    : [];
  
  // Extract OpenAI models
  const openaiModels = data.openai?.models 
    ? Object.values(data.openai.models)
        .filter(m => m.tool_call === true)
        .map(m => m.id)
        .sort()
    : [];
  
  console.log('[SettingsPanel] Anthropic models found:', anthropicModels.length, anthropicModels);
  console.log('[SettingsPanel] OpenAI models found:', openaiModels.length);
  
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
}: SettingsPanelProps) {
  const [models, setModels] = useState<Record<Provider, string[]>>({
    anthropic: [],
    openai: [],
  });
  const [loadingModels, setLoadingModels] = useState(true);

  // Fetch models on mount
  useEffect(() => {
    console.log('[SettingsPanel] Component mounted, starting fetch...');
    setLoadingModels(true);
    
    fetchModels()
      .then((fetchedModels) => {
        console.log('[SettingsPanel] ✓ Fetch complete!');
        console.log('[SettingsPanel] Setting models state:', fetchedModels);
        setModels(fetchedModels);
        setLoadingModels(false);
      })
      .catch((error) => {
        console.error('[SettingsPanel] ✗ Fetch FAILED:', error);
        setLoadingModels(false);
      });
  }, []);

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

  // Get available models for current provider
  const availableModels = useMemo(() => {
    const result = models[settings.provider] || [];
    console.log('[SettingsPanel] availableModels calculated for provider:', settings.provider);
    console.log('[SettingsPanel] Result:', result.length, 'models');
    if (result.length > 0) {
      console.log('[SettingsPanel] First 3 models:', result.slice(0, 3));
    }
    return result;
  }, [settings.provider, models]);

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
        <label htmlFor="model">
          Model
          {!loadingModels && (
            <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#8a92a6' }}>
              ({availableModels.length} available)
            </span>
          )}
        </label>
        {loadingModels ? (
          <div style={{ padding: '8px', color: '#ffa502' }}>
            Loading models from models.dev...
          </div>
        ) : availableModels.length === 0 ? (
          <div style={{ padding: '8px', color: '#ff6b81' }}>
            Failed to load models. Please refresh the page.
          </div>
        ) : (
          <select
            id="model"
            value={availableModels.includes(settings.model) ? settings.model : availableModels[0]}
            onChange={(event) => {
              console.log('[SettingsPanel] User selected model:', event.target.value);
              onChange({ model: event.target.value });
            }}
          >
            {availableModels.map((modelId: string) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="apiKey">API Key</label>
        <input
          id="apiKey"
          type="password"
          value={settings.apiKey}
          onChange={(event) => onChange({ apiKey: event.target.value.trim() })}
          placeholder={settings.provider === "openai" ? "sk-…" : "sk-ant-…"}
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
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="primary" onClick={onSave} disabled={saving} style={{ flex: 1 }}>
          {saving ? "Testing…" : "Save & Test"}
        </button>
        {onReset && (
          <button 
            className="secondary" 
            onClick={() => {
              if (confirm("Reset all settings to defaults? This will clear your API key and other configuration.")) {
                onReset();
              }
            }}
            disabled={saving}
          >
            Reset
          </button>
        )}
      </div>
    </aside>
  );
}

export default SettingsPanel;
