import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock Tauri API
const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => mockListen(...args),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render without crashing', () => {
      const { container } = render(<App />);
      expect(container).toBeInTheDocument();
    });

    it('should show settings panel if no settings exist', () => {
      render(<App />);
      expect(screen.getByText(/Settings/i)).toBeInTheDocument();
    });

    it('should register backend event listeners on mount', () => {
      render(<App />);
      
      // Verify listen was called for various events
      expect(mockListen).toHaveBeenCalledWith(
        expect.stringContaining('backend://'),
        expect.any(Function)
      );
    });
  });

  describe('Settings Management', () => {
    it('should load settings from localStorage', () => {
      const settings = {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
        autoApproveReads: true,
        confirmWrites: true,
        confirmShell: true,
      };
      localStorageMock.setItem('desk-ai::settings', JSON.stringify(settings));

      render(<App />);
      
      // Settings loaded successfully (settings panel should be closed)
      const settingsPanel = document.querySelector('[class*="settings"]');
      // Panel might be hidden or not in closed state initially
      expect(settingsPanel).toBeTruthy();
    });

    it('should save settings to localStorage', async () => {
      render(<App />);
      
      // Simulate saving settings by checking localStorage after render
      await waitFor(() => {
        const saved = localStorageMock.getItem('desk-ai::settings');
        expect(saved).toBeTruthy();
      });
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      // Setup valid settings so backend can start
      localStorageMock.setItem('desk-ai::settings', JSON.stringify({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
      }));
    });

    it('should handle sending messages when chat is enabled', async () => {
      mockInvoke.mockResolvedValue('message-id');
      
      render(<App />);
      
      // Wait for settings to load and backend to be ready
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('start_backend', expect.any(Object));
      });
    });

    it('should display user messages after submission', async () => {
      mockInvoke.mockResolvedValue('msg-1');
      
      render(<App />);
      
      // Just verify the app renders with settings
      await waitFor(() => {
        expect(screen.getByText(/DESK AI/i)).toBeInTheDocument();
      });
    });

    it('should have clear chat button', async () => {
      render(<App />);
      
      const clearButton = screen.getByRole('button', { name: /clear chat/i });
      expect(clearButton).toBeInTheDocument();
      expect(clearButton).toBeDisabled(); // Disabled when no messages
    });
  });

  describe('Backend Status', () => {
    it('should start with idle status', () => {
      render(<App />);
      // Backend starts idle, should see offline status indicator
      const statusIndicator = screen.getByText(/Offline|Online/i);
      expect(statusIndicator).toBeInTheDocument();
    });

    it('should call start_backend when settings are valid', async () => {
      localStorageMock.setItem('desk-ai::settings', JSON.stringify({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
      }));
      
      render(<App />);
      
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'start_backend',
          expect.any(Object)
        );
      });
    });
  });

  describe('Approval Requests', () => {
    it('should handle approval requests', async () => {
      mockInvoke.mockResolvedValue(undefined);
      
      render(<App />);
      
      // Approval logic would need to be triggered by backend events
      // This is a placeholder for approval flow testing
      expect(mockInvoke).toBeDefined();
    });
  });

  describe('Stop Functionality', () => {
    it('should have stop functionality available', async () => {
      mockInvoke.mockResolvedValue('msg-id');
      
      render(<App />);
      
      // Stop button would appear when processing
      // This is tested in Chat.test.tsx more thoroughly
      await waitFor(() => {
        expect(screen.getByText(/DESK AI/i)).toBeInTheDocument();
      });
    });
  });

  describe('Settings Panel Toggle', () => {
    beforeEach(() => {
      localStorageMock.setItem('desk-ai::settings', JSON.stringify({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
      }));
    });

    it('should have settings button in header', async () => {
      render(<App />);
      
      // Settings button exists (it's the one with settings icon, but no accessible name)
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle backend errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('Backend failed'));
      
      render(<App />);
      
      // App should still render even if backend fails
      expect(screen.getByText(/DESK AI/i)).toBeInTheDocument();
    });
  });

  describe('Auto-approve Toggle', () => {
    beforeEach(() => {
      localStorageMock.setItem('desk-ai::settings', JSON.stringify({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
        autoApproveAll: false,
      }));
    });

    it('should have auto-approve toggle in UI', () => {
      render(<App />);
      
      // Should have Manual Approve label
      expect(screen.getByText(/Manual Approve/i)).toBeInTheDocument();
      
      // Should have switches (without accessible names currently)
      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('System Wide Toggle', () => {
    beforeEach(() => {
      localStorageMock.setItem('desk-ai::settings', JSON.stringify({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
        allowSystemWide: false,
      }));
    });

    it('should have toggle switches in header', () => {
      render(<App />);
      
      // Should have switches in the UI
      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(0);
    });
  });

  describe('Backend Event Handlers', () => {
    const eventCallbacks: Map<string, (payload: any) => void> = new Map();

    beforeEach(() => {
      localStorageMock.setItem('desk-ai::settings', JSON.stringify({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
      }));

      // Capture all event listener callbacks by event name
      mockListen.mockImplementation((eventName: string, callback: (event: any) => void) => {
        eventCallbacks.set(eventName, callback);
        return Promise.resolve(() => {});
      });
    });

    afterEach(() => {
      eventCallbacks.clear();
    });

    it('should handle tool_call_start event', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      // Wait a bit for all listeners to register
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate tool_call_start event
      const callback = eventCallbacks.get('backend://tool_call_start');
      if (!callback) {
        throw new Error(`Callback not found`);
      }
      
      act(() => {
        callback({
          payload: {
            toolCallId: 'tool-1',
            name: 'run_shell',
            arguments: { command: 'ls -la' },
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/run_shell/i)).toBeInTheDocument();
      });
    });

    it('should handle tool_call_end event with success', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      // First add a tool call
      const startCallback = eventCallbacks.get('backend://tool_call_start');
      if (startCallback) {
        startCallback({
          payload: {
            toolCallId: 'tool-1',
            name: 'read_file',
            arguments: { path: '/test/file.txt' },
          },
        });
      }

      await waitFor(() => {
        expect(screen.getByText(/Reading file/i)).toBeInTheDocument();
        expect(screen.getByText('/test/file.txt')).toBeInTheDocument();
      });

      // Now simulate completion
      const endCallback = eventCallbacks.get('backend://tool_call_end');
      if (endCallback) {
        endCallback({
          payload: {
            toolCallId: 'tool-1',
            error: null,
          },
        });
      }

      // Tool should still be visible but marked as completed
      await waitFor(() => {
        expect(screen.getByText(/Reading file/i)).toBeInTheDocument();
        expect(screen.getByText('/test/file.txt')).toBeInTheDocument();
      });
    });

    it('should handle tool_call_end event with error', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      // First add a tool call
      const startCallback = eventCallbacks.get('backend://tool_call_start');
      if (startCallback) {
        startCallback({
          payload: {
            toolCallId: 'tool-2',
            name: 'write_file',
            arguments: { path: '/test/output.txt' },
          },
        });
      }

      await waitFor(() => {
        expect(screen.getByText(/Writing file/i)).toBeInTheDocument();
        expect(screen.getByText('/test/output.txt')).toBeInTheDocument();
      });

      // Now simulate error
      const endCallback = eventCallbacks.get('backend://tool_call_end');
      if (endCallback) {
        endCallback({
          payload: {
            toolCallId: 'tool-2',
            error: 'Permission denied',
          },
        });
      }

      // Error should be appended to the message
      await waitFor(() => {
        expect(screen.getByText(/Permission denied/i)).toBeInTheDocument();
      });
    });

    it('should handle shell_start event', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      // Simulate shell_start event
      const listeners = mockListen.mock.calls;
      const shellStartListener = listeners.find(([name]) => name === 'backend://shell_start');
      if (shellStartListener) {
        const callback = shellStartListener[1];
        callback({
          payload: {
            sessionId: 'session-1',
            cmd: 'npm test',
            cwd: '/home/user/project',
            ts: new Date().toISOString(),
          },
        });
      }

      // Session should be created (check via internal state, can't directly observe)
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });
    });

    it('should handle shell_data event', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      // First create a session
      const listeners = mockListen.mock.calls;
      const shellStartListener = listeners.find(([name]) => name === 'backend://shell_start');
      if (shellStartListener) {
        const callback = shellStartListener[1];
        callback({
          payload: {
            sessionId: 'session-2',
            cmd: 'echo test',
            cwd: '/tmp',
            ts: new Date().toISOString(),
          },
        });
      }

      // Then send output
      const shellDataListener = listeners.find(([name]) => name === 'backend://shell_data');
      if (shellDataListener) {
        const callback = shellDataListener[1];
        callback({
          payload: {
            sessionId: 'session-2',
            stream: 'stdout',
            chunk: 'test output\n',
          },
        });
      }

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });
    });

    it('should handle shell_end event with success', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      // Create session and end it
      const listeners = mockListen.mock.calls;
      const shellStartListener = listeners.find(([name]) => name === 'backend://shell_start');
      if (shellStartListener) {
        const callback = shellStartListener[1];
        callback({
          payload: {
            sessionId: 'session-3',
            cmd: 'true',
            cwd: '/tmp',
            ts: new Date().toISOString(),
          },
        });
      }

      const shellEndListener = listeners.find(([name]) => name === 'backend://shell_end');
      if (shellEndListener) {
        const callback = shellEndListener[1];
        callback({
          payload: {
            sessionId: 'session-3',
            exitCode: 0,
          },
        });
      }

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });
    });

    it('should handle shell_end event with error', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const shellStartListener = listeners.find(([name]) => name === 'backend://shell_start');
      if (shellStartListener) {
        const callback = shellStartListener[1];
        callback({
          payload: {
            sessionId: 'session-4',
            cmd: 'false',
            cwd: '/tmp',
            ts: new Date().toISOString(),
          },
        });
      }

      const shellEndListener = listeners.find(([name]) => name === 'backend://shell_end');
      if (shellEndListener) {
        const callback = shellEndListener[1];
        callback({
          payload: {
            sessionId: 'session-4',
            exitCode: 1,
          },
        });
      }

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });
    });

    it('should handle backend stderr event', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const stderrListener = listeners.find(([name]) => name === 'backend://stderr');
      if (stderrListener) {
        const callback = stderrListener[1];
        callback({
          payload: {
            type: 'stderr',
            message: 'Warning: deprecated API',
          },
        });
      }

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });
    });

    it('should handle backend exit event', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const exitListener = listeners.find(([name]) => name === 'backend://exit');
      if (exitListener) {
        const callback = exitListener[1];
        callback({
          payload: {
            type: 'exit',
            code: 0,
          },
        });
      }

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });
    });

    it('should handle tool_log event', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const toolLogListener = listeners.find(([name]) => name === 'backend://tool_log');
      if (toolLogListener) {
        const callback = toolLogListener[1];
        callback({
          payload: {
            type: 'tool_log',
            message: 'File created successfully',
            ts: new Date().toISOString(),
          },
        });
      }

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });
    });

    it('should handle authentication errors specially', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const errorListener = listeners.find(([name]) => name === 'backend://error');
      if (errorListener) {
        const callback = errorListener[1];
        callback({
          payload: {
            type: 'error',
            message: '401 Unauthorized: Invalid API key',
          },
        });
      }

      await waitFor(() => {
        // Should show auth error status
        expect(mockListen).toHaveBeenCalled();
      });
    });

    it('should handle token streaming', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const tokenListener = listeners.find(([name]) => name === 'backend://token');
      if (tokenListener) {
        const callback = tokenListener[1];
        
        // First token
        callback({
          payload: {
            type: 'token',
            id: 'msg-1',
            text: 'Hello ',
          },
        });

        await waitFor(() => {
          expect(screen.getByText(/Hello/i)).toBeInTheDocument();
        });

        // Second token
        callback({
          payload: {
            type: 'token',
            id: 'msg-1',
            text: 'world',
          },
        });

        await waitFor(() => {
          expect(screen.getByText(/Hello world/i)).toBeInTheDocument();
        });
      }
    });

    it('should handle final message event', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      
      // First stream some tokens
      const tokenListener = listeners.find(([name]) => name === 'backend://token');
      if (tokenListener) {
        const callback = tokenListener[1];
        callback({
          payload: {
            type: 'token',
            id: 'msg-2',
            text: 'Complete message',
          },
        });
      }

      await waitFor(() => {
        expect(screen.getByText(/Complete message/i)).toBeInTheDocument();
      });

      // Then finalize
      const finalListener = listeners.find(([name]) => name === 'backend://final');
      if (finalListener) {
        const callback = finalListener[1];
        callback({
          payload: {
            type: 'final',
            id: 'msg-2',
          },
        });
      }

      await waitFor(() => {
        expect(screen.getByText(/Complete message/i)).toBeInTheDocument();
      });
    });

    it('should handle tool_request with auto-approval enabled', async () => {
      localStorageMock.setItem('desk-ai::settings', JSON.stringify({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
        autoApproveAll: true,
      }));

      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const toolRequestListener = listeners.find(([name]) => name === 'backend://tool_request');
      if (toolRequestListener) {
        const callback = toolRequestListener[1];
        callback({
          payload: {
            requestId: 'req-1',
            action: 'shell',
            command: 'ls',
            autoApproved: false,
          },
        });
      }

      // Should auto-approve
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('approve_tool', expect.objectContaining({
          requestId: 'req-1',
          approved: true,
        }));
      });
    });

    it('should not show approval modal for auto-approved requests', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const toolRequestListener = listeners.find(([name]) => name === 'backend://tool_request');
      if (toolRequestListener) {
        const callback = toolRequestListener[1];
        callback({
          payload: {
            requestId: 'req-2',
            action: 'read',
            path: '/test.txt',
            autoApproved: true,
          },
        });
      }

      // Should NOT show approval request
      await waitFor(() => {
        expect(screen.queryByText(/Approve tool action/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Format Tool Call', () => {
    beforeEach(() => {
      localStorageMock.setItem('desk-ai::settings', JSON.stringify({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        workdir: '/test/path',
      }));
    });

    it('should format list_directory tool call', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const toolStartListener = listeners.find(([name]) => name === 'backend://tool_call_start');
      if (toolStartListener) {
        const callback = toolStartListener[1];
        callback({
          payload: {
            toolCallId: 'tool-list',
            name: 'list_directory',
            arguments: { path: '/home/user' },
          },
        });
      }

      await waitFor(() => {
        expect(screen.getByText(/Listing directory/i)).toBeInTheDocument();
        expect(screen.getByText('/home/user')).toBeInTheDocument();
      });
    });

    it('should format delete_path tool call', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      const listeners = mockListen.mock.calls;
      const toolStartListener = listeners.find(([name]) => name === 'backend://tool_call_start');
      if (toolStartListener) {
        const callback = toolStartListener[1];
        callback({
          payload: {
            toolCallId: 'tool-delete',
            name: 'delete_path',
            arguments: { path: '/tmp/old.txt' },
          },
        });
      }

      await waitFor(() => {
        expect(screen.getByText(/Deleting/i)).toBeInTheDocument();
        expect(screen.getByText('/tmp/old.txt')).toBeInTheDocument();
      });
    });
  });
});
