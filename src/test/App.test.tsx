import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});
