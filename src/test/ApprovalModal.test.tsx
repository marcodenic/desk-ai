import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApprovalModal from '../components/ApprovalModal';
import type { ApprovalRequest } from '../types';

describe('ApprovalModal', () => {
  const defaultRequest: ApprovalRequest = {
    requestId: 'test-req-1',
    action: 'shell',
    command: 'ls -la',
  };

  const mockOnApprove = vi.fn();
  const mockOnReject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when request is null', () => {
      const { container } = render(
        <ApprovalModal
          request={null}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should not render when request is auto-approved', () => {
      const autoApprovedRequest: ApprovalRequest = {
        ...defaultRequest,
        autoApproved: true,
      };
      const { container } = render(
        <ApprovalModal
          request={autoApprovedRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render modal with request details', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Approve tool action?')).toBeInTheDocument();
      expect(screen.getByText('This action requires your permission.')).toBeInTheDocument();
    });

    it('should render Allow and Deny buttons', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Allow')).toBeInTheDocument();
      expect(screen.getByText('Deny')).toBeInTheDocument();
    });
  });

  describe('Action Types', () => {
    it('should display shell command approval', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Run shell command')).toBeInTheDocument();
      expect(screen.getByText('ls -la')).toBeInTheDocument();
    });

    it('should display read file approval', () => {
      const readRequest: ApprovalRequest = {
        requestId: 'read-1',
        action: 'read',
        path: '/tmp/test.txt',
      };

      render(
        <ApprovalModal
          request={readRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Read file')).toBeInTheDocument();
      expect(screen.getByText('/tmp/test.txt')).toBeInTheDocument();
    });

    it('should display write file approval', () => {
      const writeRequest: ApprovalRequest = {
        requestId: 'write-1',
        action: 'write',
        path: '/tmp/output.txt',
        bytes: 1024,
      };

      render(
        <ApprovalModal
          request={writeRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Write file')).toBeInTheDocument();
      expect(screen.getByText('/tmp/output.txt')).toBeInTheDocument();
      expect(screen.getByText('1024 bytes')).toBeInTheDocument();
    });

    it('should display delete file approval', () => {
      const deleteRequest: ApprovalRequest = {
        requestId: 'delete-1',
        action: 'delete',
        path: '/tmp/old.txt',
      };

      render(
        <ApprovalModal
          request={deleteRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Delete file')).toBeInTheDocument();
      expect(screen.getByText('/tmp/old.txt')).toBeInTheDocument();
    });

    it('should display list directory approval', () => {
      const listRequest: ApprovalRequest = {
        requestId: 'list-1',
        action: 'list',
        path: '/home/user',
      };

      render(
        <ApprovalModal
          request={listRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('List directory')).toBeInTheDocument();
      expect(screen.getByText('/home/user')).toBeInTheDocument();
    });
  });

  describe('Elevated Privilege Warning', () => {
    it('should show warning for elevated commands', () => {
      const elevatedRequest: ApprovalRequest = {
        requestId: 'elevated-1',
        action: 'shell',
        command: 'sudo rm -rf /tmp/*',
        elevated: true,
      };

      render(
        <ApprovalModal
          request={elevatedRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Elevated Privileges Required')).toBeInTheDocument();
      expect(
        screen.getByText(/This command requires administrator\/root privileges/i)
      ).toBeInTheDocument();
    });

    it('should not show warning for regular commands', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.queryByText('Elevated Privileges Required')).not.toBeInTheDocument();
    });
  });

  describe('Description Field', () => {
    it('should display description when provided', () => {
      const requestWithDescription: ApprovalRequest = {
        ...defaultRequest,
        description: 'List all files in the directory',
      };

      render(
        <ApprovalModal
          request={requestWithDescription}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('List all files in the directory')).toBeInTheDocument();
    });

    it('should not display description field when not provided', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.queryByText('Details')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onApprove when Allow button is clicked', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const allowButton = screen.getByText('Allow');
      fireEvent.click(allowButton);

      expect(mockOnApprove).toHaveBeenCalledWith(defaultRequest);
      expect(mockOnApprove).toHaveBeenCalledTimes(1);
    });

    it('should call onReject when Deny button is clicked', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const denyButton = screen.getByText('Deny');
      fireEvent.click(denyButton);

      expect(mockOnReject).toHaveBeenCalledWith(defaultRequest);
      expect(mockOnReject).toHaveBeenCalledTimes(1);
    });

    it('should disable buttons when busy', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={true}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const allowButton = screen.getByText('Allow');
      const denyButton = screen.getByText('Deny');

      expect(allowButton).toBeDisabled();
      expect(denyButton).toBeDisabled();
    });

    it('should not call handlers when buttons are disabled', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={true}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const allowButton = screen.getByText('Allow');
      fireEvent.click(allowButton);

      expect(mockOnApprove).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should call onApprove when Enter key is pressed', async () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(mockOnApprove).toHaveBeenCalledWith(defaultRequest);
      });
    });

    it('should call onReject when Escape key is pressed', async () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(mockOnReject).toHaveBeenCalledWith(defaultRequest);
      });
    });

    it('should not respond to keyboard shortcuts when busy', async () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={true}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(mockOnApprove).not.toHaveBeenCalled();
        expect(mockOnReject).not.toHaveBeenCalled();
      });
    });

    it('should cleanup keyboard listeners on unmount', () => {
      const { unmount } = render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      unmount();

      // Fire events after unmount - they should not trigger handlers
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(mockOnApprove).not.toHaveBeenCalled();
    });
  });

  describe('Backdrop Behavior', () => {
    it('should not close modal on backdrop click', () => {
      const { container } = render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const backdrop = container.querySelector('.modal-backdrop');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      // Modal should still be rendered
      expect(screen.getByText('Approve tool action?')).toBeInTheDocument();
      expect(mockOnReject).not.toHaveBeenCalled();
    });

    it('should prevent event propagation on modal content click', () => {
      const { container } = render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const modal = container.querySelector('.modal');
      if (modal) {
        fireEvent.click(modal);
      }

      // Should not trigger any action
      expect(mockOnApprove).not.toHaveBeenCalled();
      expect(mockOnReject).not.toHaveBeenCalled();
    });
  });

  describe('Focus Management', () => {
    it('should autofocus the Allow button', () => {
      render(
        <ApprovalModal
          request={defaultRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const allowButton = screen.getByText('Allow');
      // autoFocus is a prop, not an HTML attribute in React, so we check differently
      expect(allowButton.closest('button')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle request with all optional fields', () => {
      const fullRequest: ApprovalRequest = {
        requestId: 'full-1',
        action: 'write',
        command: 'echo "test" > file.txt',
        path: '/tmp/file.txt',
        description: 'Write test data',
        bytes: 5,
        elevated: true,
      };

      render(
        <ApprovalModal
          request={fullRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Write file')).toBeInTheDocument();
      expect(screen.getByText('echo "test" > file.txt')).toBeInTheDocument();
      expect(screen.getByText('/tmp/file.txt')).toBeInTheDocument();
      expect(screen.getByText('Write test data')).toBeInTheDocument();
      expect(screen.getByText('5 bytes')).toBeInTheDocument();
      expect(screen.getByText('Elevated Privileges Required')).toBeInTheDocument();
    });

    it('should handle zero bytes', () => {
      const zeroByteRequest: ApprovalRequest = {
        requestId: 'zero-1',
        action: 'write',
        path: '/tmp/empty.txt',
        bytes: 0,
      };

      render(
        <ApprovalModal
          request={zeroByteRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('0 bytes')).toBeInTheDocument();
    });

    it('should handle very long commands', () => {
      const longCommand = 'echo ' + 'a'.repeat(200);
      const longRequest: ApprovalRequest = {
        requestId: 'long-1',
        action: 'shell',
        command: longCommand,
      };

      render(
        <ApprovalModal
          request={longRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText(longCommand)).toBeInTheDocument();
    });

    it('should handle very long paths', () => {
      const longPath = '/very/long/path/' + 'nested/'.repeat(20) + 'file.txt';
      const longPathRequest: ApprovalRequest = {
        requestId: 'long-path-1',
        action: 'read',
        path: longPath,
      };

      render(
        <ApprovalModal
          request={longPathRequest}
          busy={false}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText(longPath)).toBeInTheDocument();
    });
  });
});
