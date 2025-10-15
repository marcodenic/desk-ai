import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPanel from '../components/SettingsPanel';
import type { BackendStatus, Provider, Settings } from '../types';

// Mock Tauri APIs
const mockFetch = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: any[]) => mockFetch(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

describe('SettingsPanel', () => {
  const defaultSettings: Settings = {
    provider: 'openai',
    apiKey: 'sk-test123',
    model: 'gpt-4o-mini',
    workdir: '/home/user/project',
    autoApproveReads: true,
    confirmWrites: true,
    confirmShell: true,
    showTerminalOnCommand: true,
    autoApproveAll: false,
    allowSystemWide: false,
    showCommandOutput: true,
    allowElevatedCommands: false,
  };

  const mockOnChange = vi.fn();
  const mockOnSave = vi.fn();
  const mockOnSelectDirectory = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful model fetch by default
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        anthropic: {
          models: {
            'claude-3-5-sonnet': { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', tool_call: true },
            'claude-3-opus': { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', tool_call: true },
          },
        },
        openai: {
          models: {
            'gpt-4o': { id: 'gpt-4o', name: 'GPT-4 Omni', tool_call: true },
            'gpt-4o-mini': { id: 'gpt-4o-mini', name: 'GPT-4 Omni Mini', tool_call: true },
          },
        },
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render without crashing', async () => {
      const { container } = render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(container).toBeInTheDocument();
      });
    });

    it('should render Settings header', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument();
      });
    });

    it('should render Connection section', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Connection')).toBeInTheDocument();
      });
    });

    it('should render Permissions section', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Permissions')).toBeInTheDocument();
      });
    });
  });

  describe('Backend Status Display', () => {
    it('should show Ready status badge when backend is ready', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="ready"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Ready')).toBeInTheDocument();
      });
    });

    it('should show Testing badge when backend is starting', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="starting"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Testing')).toBeInTheDocument();
      });
    });

    it('should show Error badge when backend has error', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="error"
          statusMessage="Connection failed"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
    });

    it('should display success message when ready', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="ready"
          statusMessage="Backend configured"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Backend configured')).toBeInTheDocument();
      });
    });

    it('should display error message when backend has error', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="error"
          statusMessage="Invalid API key"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Invalid API key')).toBeInTheDocument();
      });
    });
  });

  describe('Provider Selection', () => {
    it('should display current provider', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Provider')).toBeInTheDocument();
      });
    });

    it('should call onChange when provider is changed', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const providerTrigger = screen.getByRole('combobox', { name: /provider/i });
      fireEvent.click(providerTrigger);
      
      await waitFor(() => {
        const anthropicOption = screen.getByText('Anthropic Claude');
        fireEvent.click(anthropicOption);
      });
      
      expect(mockOnChange).toHaveBeenCalledWith({ provider: 'anthropic' });
    });
  });

  describe('Model Selection', () => {
    it('should show loading state while fetching models', () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('should display models after successful fetch', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
        expect(screen.getByText('(2 available)')).toBeInTheDocument();
      });
    });

    it('should display error when model fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load')).toBeInTheDocument();
      });
    });

    it('should call onChange when model is changed', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
      });
      
      const modelTrigger = screen.getByRole('combobox', { name: /model/i });
      fireEvent.click(modelTrigger);
      
      await waitFor(() => {
        const gpt4Option = screen.getByText('gpt-4o');
        fireEvent.click(gpt4Option);
      });
      
      expect(mockOnChange).toHaveBeenCalledWith({ model: 'gpt-4o' });
    });
  });

  describe('API Key Input', () => {
    it('should display API key input', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        const input = screen.getByLabelText('API Key');
        expect(input).toBeInTheDocument();
        expect(input).toHaveAttribute('type', 'password');
      });
    });

    it('should call onChange when API key is changed', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const input = screen.getByLabelText('API Key') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'sk-newkey456' } });
      
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith({ apiKey: 'sk-newkey456' });
      });
    });

    it('should trim whitespace from API key', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const input = screen.getByLabelText('API Key') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '  sk-newkey456  ' } });
      
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith({ apiKey: 'sk-newkey456' });
      });
    });
  });

  describe('Working Directory', () => {
    it('should display current working directory', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('/home/user/project')).toBeInTheDocument();
      });
    });

    it('should show "No directory" when workdir is empty', async () => {
      const settingsNoDir = { ...defaultSettings, workdir: '' };
      
      render(
        <SettingsPanel
          settings={settingsNoDir}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('No directory')).toBeInTheDocument();
      });
    });

    it('should call onSelectDirectory when Browse button is clicked', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const browseButton = screen.getByRole('button', { name: /browse/i });
      fireEvent.click(browseButton);
      
      expect(mockOnSelectDirectory).toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('should show error when API key is missing', async () => {
      const invalidSettings = { ...defaultSettings, apiKey: '' };
      
      render(
        <SettingsPanel
          settings={invalidSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        const errors = screen.getAllByText('API key is required');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('should show error for invalid OpenAI API key format', async () => {
      const invalidSettings = { ...defaultSettings, apiKey: 'invalid-key' };
      
      render(
        <SettingsPanel
          settings={invalidSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        const errors = screen.getAllByText(/OpenAI API keys should start with 'sk-'/i);
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('should show error when working directory is missing', async () => {
      const invalidSettings = { ...defaultSettings, workdir: '' };
      
      render(
        <SettingsPanel
          settings={invalidSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        const errors = screen.getAllByText('Working directory is required');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    it('should disable Save button when validation errors exist', async () => {
      const invalidSettings = { ...defaultSettings, apiKey: '', workdir: '' };
      
      render(
        <SettingsPanel
          settings={invalidSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /save & test/i });
        expect(saveButton).toBeDisabled();
      });
    });

    it('should show validation error summary', async () => {
      const invalidSettings = { ...defaultSettings, apiKey: '', workdir: '' };
      
      render(
        <SettingsPanel
          settings={invalidSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Please fix the following:')).toBeInTheDocument();
      });
    });
  });

  describe('Permission Toggles', () => {
    it('should display auto-approve reads toggle', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Auto-approve non-destructive reads')).toBeInTheDocument();
      });
    });

    it('should call onChange when auto-approve reads is toggled', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const checkbox = screen.getByRole('checkbox', { name: /auto-approve non-destructive reads/i });
      fireEvent.click(checkbox);
      
      expect(mockOnChange).toHaveBeenCalledWith({ autoApproveReads: false });
    });

    it('should display confirm writes toggle', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Confirm writes & deletes')).toBeInTheDocument();
      });
    });

    it('should call onChange when confirm writes is toggled', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const checkbox = screen.getByRole('checkbox', { name: /confirm writes & deletes/i });
      fireEvent.click(checkbox);
      
      expect(mockOnChange).toHaveBeenCalledWith({ confirmWrites: false });
    });

    it('should display confirm shell toggle', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Confirm shell commands')).toBeInTheDocument();
      });
    });

    it('should display show command output toggle', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Show command output in chat')).toBeInTheDocument();
      });
    });

    it('should display elevated commands toggle with warning', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Allow elevated commands (sudo/admin)')).toBeInTheDocument();
        expect(screen.getByText('⚠️ Enables commands that require administrator privileges')).toBeInTheDocument();
      });
    });
  });

  describe('Accordion Sections', () => {
    it('should collapse Connection section when clicked', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const connectionHeader = screen.getByText('Connection');
      
      // Initially expanded
      await waitFor(() => {
        expect(screen.getByText('Provider')).toBeInTheDocument();
      });
      
      // Click to collapse
      fireEvent.click(connectionHeader);
      
      await waitFor(() => {
        expect(screen.queryByText('Provider')).not.toBeInTheDocument();
      });
    });

    it('should collapse Permissions section when clicked', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const permissionsHeader = screen.getByText('Permissions');
      
      // Initially expanded
      await waitFor(() => {
        expect(screen.getByText('Auto-approve non-destructive reads')).toBeInTheDocument();
      });
      
      // Click to collapse
      fireEvent.click(permissionsHeader);
      
      await waitFor(() => {
        expect(screen.queryByText('Auto-approve non-destructive reads')).not.toBeInTheDocument();
      });
    });
  });

  describe('Save Button', () => {
    it('should display Save & Test button', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save & test/i })).toBeInTheDocument();
      });
    });

    it('should call onSave when Save button is clicked', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /save & test/i });
        fireEvent.click(saveButton);
      });
      
      expect(mockOnSave).toHaveBeenCalled();
    });

    it('should show Testing… when saving', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={true}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Testing…')).toBeInTheDocument();
      });
    });

    it('should disable Save button when saving', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={true}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /testing/i });
        expect(saveButton).toBeDisabled();
      });
    });
  });

  describe('Open Log File', () => {
    it('should display Open Log File button', async () => {
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /open log file/i })).toBeInTheDocument();
      });
    });

    it('should call invoke when Open Log File is clicked', async () => {
      mockInvoke.mockResolvedValue(undefined);
      
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const logButton = screen.getByRole('button', { name: /open log file/i });
      fireEvent.click(logButton);
      
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('open_log_file');
      });
    });

    it('should handle error when opening log file fails', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      mockInvoke.mockRejectedValue(new Error('File not found'));
      
      render(
        <SettingsPanel
          settings={defaultSettings}
          backendStatus="idle"
          saving={false}
          onChange={mockOnChange}
          onSave={mockOnSave}
          onSelectDirectory={mockOnSelectDirectory}
        />
      );
      
      const logButton = screen.getByRole('button', { name: /open log file/i });
      fireEvent.click(logButton);
      
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to open log file: File not found');
      });
      
      alertSpy.mockRestore();
    });
  });
});
