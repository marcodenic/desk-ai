import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Chat from '../components/Chat';
import type { ChatMessage, ApprovalRequest, TerminalSession } from '../types';
import type { StatusType } from '../components/StatusIndicator';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe('Chat', () => {
  const defaultProps = {
    messages: [] as ChatMessage[],
    thinking: false,
    backendStatus: 'ready' as const,
    aiStatus: 'idle' as StatusType,
    disabled: false,
    onSend: vi.fn(() => Promise.resolve()),
    onStop: vi.fn(),
    onClear: vi.fn(),
    onToggleSettings: vi.fn(),
    settingsPanelOpen: false,
    approvalRequest: null as ApprovalRequest | null,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    autoApproveAll: false,
    onToggleAutoApprove: vi.fn(),
    allowSystemWide: false,
    onToggleSystemWide: vi.fn(),
    terminalSessions: [] as TerminalSession[],
    showCommandOutput: true,
    popupMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      const { container } = render(<Chat {...defaultProps} />);
      expect(container).toBeInTheDocument();
    });

    it('should render textarea for input', () => {
      render(<Chat {...defaultProps} />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
    });

    it('should render header with title', () => {
      render(<Chat {...defaultProps} />);
      expect(screen.getByText('DESK AI')).toBeInTheDocument();
    });
  });

  describe('Message Input', () => {
    it('should enable textarea when backend is ready', () => {
      render(<Chat {...defaultProps} />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).not.toBeDisabled();
    });

    it('should disable textarea when backend is not ready', () => {
      render(<Chat {...defaultProps} backendStatus="starting" />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should update textarea value on change', () => {
      render(<Chat {...defaultProps} />);
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      
      fireEvent.change(textarea, { target: { value: 'Hello AI' } });
      
      expect(textarea.value).toBe('Hello AI');
    });

    it('should call onSend when form is submitted', async () => {
      const onSend = vi.fn(() => Promise.resolve());
      render(<Chat {...defaultProps} onSend={onSend} />);
      
      const textarea = screen.getByRole('textbox');
      const form = textarea.closest('form');
      
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.submit(form!);
      
      await waitFor(() => {
        expect(onSend).toHaveBeenCalledWith('Test message');
      });
    });
  });

  describe('Stop/Send Button', () => {
    it('should show stop button when thinking', () => {
      render(<Chat {...defaultProps} thinking={true} />);
      // Stop button is a button with Square icon, we can check for the button type
      const buttons = screen.getAllByRole('button');
      const stopButton = buttons.find(btn => btn.getAttribute('type') === 'button' && btn.className.includes('destructive'));
      expect(stopButton).toBeInTheDocument();
    });

    it('should show stop button when message is streaming', () => {
      const streamingMessage: ChatMessage = {
        id: '1',
        role: 'assistant',
        content: 'Response...',
        streaming: true,
        createdAt: new Date().toISOString(),
      };
      render(<Chat {...defaultProps} messages={[streamingMessage]} />);
      
      const buttons = screen.getAllByRole('button');
      const stopButton = buttons.find(btn => btn.className.includes('destructive'));
      expect(stopButton).toBeInTheDocument();
    });

    it('should show stop button when approval request is pending', () => {
      const approvalRequest: ApprovalRequest = {
        requestId: 'req1',
        action: 'shell',
        command: 'ls -la',
      };
      render(<Chat {...defaultProps} approvalRequest={approvalRequest} />);
      
      const buttons = screen.getAllByRole('button');
      const stopButton = buttons.find(btn => btn.className.includes('destructive'));
      expect(stopButton).toBeInTheDocument();
    });

    it('should call onStop when stop button is clicked', () => {
      const onStop = vi.fn();
      render(<Chat {...defaultProps} thinking={true} onStop={onStop} />);
      
      const buttons = screen.getAllByRole('button');
      const stopButton = buttons.find(btn => btn.className.includes('destructive'));
      
      if (stopButton) {
        fireEvent.click(stopButton);
        expect(onStop).toHaveBeenCalled();
      }
    });
  });

  describe('Message Display', () => {
    it('should display user messages', () => {
      const userMessage: ChatMessage = {
        id: '1',
        role: 'user',
        content: 'Hello, how are you?',
        createdAt: new Date().toISOString(),
      };
      render(<Chat {...defaultProps} messages={[userMessage]} />);
      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
    });

    it('should display assistant messages', () => {
      const assistantMessage: ChatMessage = {
        id: '2',
        role: 'assistant',
        content: 'I am doing well, thank you!',
        createdAt: new Date().toISOString(),
      };
      render(<Chat {...defaultProps} messages={[assistantMessage]} />);
      expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
    });

    it('should display thinking indicator when thinking is true', () => {
      render(<Chat {...defaultProps} thinking={true} />);
      expect(screen.getByText(/Thinking/i)).toBeInTheDocument();
    });

    it('should display multiple messages', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'First',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Second',
          createdAt: new Date().toISOString(),
        },
      ];
      render(<Chat {...defaultProps} messages={messages} />);
      
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
    });
  });

  describe('Approval Request', () => {
    it('should display approval request bubble', () => {
      const approvalRequest: ApprovalRequest = {
        requestId: 'req1',
        action: 'shell',
        command: 'rm -rf /',
      };
      render(<Chat {...defaultProps} approvalRequest={approvalRequest} />);
      
      expect(screen.getByText(/Approval required/i)).toBeInTheDocument();
      expect(screen.getByText('rm -rf /')).toBeInTheDocument();
    });

    it('should call onApprove when Allow button is clicked', () => {
      const onApprove = vi.fn();
      const approvalRequest: ApprovalRequest = {
        requestId: 'req1',
        action: 'shell',
        command: 'ls',
      };
      render(<Chat {...defaultProps} approvalRequest={approvalRequest} onApprove={onApprove} />);
      
      const allowButton = screen.getByRole('button', { name: /Allow/i });
      fireEvent.click(allowButton);
      
      expect(onApprove).toHaveBeenCalled();
    });

    it('should call onReject when Deny button is clicked', () => {
      const onReject = vi.fn();
      const approvalRequest: ApprovalRequest = {
        requestId: 'req1',
        action: 'write',
        path: '/etc/passwd',
      };
      render(<Chat {...defaultProps} approvalRequest={approvalRequest} onReject={onReject} />);
      
      const denyButton = screen.getByRole('button', { name: /Deny/i });
      fireEvent.click(denyButton);
      
      expect(onReject).toHaveBeenCalled();
    });
  });

  describe('Clear Chat', () => {
    it('should disable clear button when no messages', () => {
      render(<Chat {...defaultProps} messages={[]} />);
      const clearButton = screen.getByRole('button', { name: /clear/i });
      expect(clearButton).toBeDisabled();
    });

    it('should enable clear button when messages exist', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          createdAt: new Date().toISOString(),
        },
      ];
      render(<Chat {...defaultProps} messages={messages} />);
      const clearButton = screen.getByRole('button', { name: /clear/i });
      expect(clearButton).not.toBeDisabled();
    });

    it('should call onClear when clear button is clicked', () => {
      const onClear = vi.fn();
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          createdAt: new Date().toISOString(),
        },
      ];
      render(<Chat {...defaultProps} messages={messages} onClear={onClear} />);
      
      const clearButton = screen.getByRole('button', { name: /clear/i });
      fireEvent.click(clearButton);
      
      expect(onClear).toHaveBeenCalled();
    });
  });
});
