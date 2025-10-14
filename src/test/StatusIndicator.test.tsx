import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusIndicator, type StatusType } from '../components/StatusIndicator';

describe('StatusIndicator', () => {
  const statuses: StatusType[] = ['idle', 'offline', 'thinking', 'executing', 'waiting', 'streaming', 'error'];

  describe('Rendering', () => {
    it('should render without crashing', () => {
      const { container } = render(<StatusIndicator status="idle" />);
      expect(container).toBeInTheDocument();
    });

    statuses.forEach(status => {
      it(`should render ${status} status`, () => {
        render(<StatusIndicator status={status} />);
        const statusElement = screen.getByText(new RegExp(getStatusLabel(status), 'i'));
        expect(statusElement).toBeInTheDocument();
      });
    });
  });

  describe('Status Labels', () => {
    it('should display "Online" for idle status', () => {
      render(<StatusIndicator status="idle" />);
      expect(screen.getByText(/Online/i)).toBeInTheDocument();
    });

    it('should display "Offline" for offline status', () => {
      render(<StatusIndicator status="offline" />);
      expect(screen.getByText(/Offline/i)).toBeInTheDocument();
    });

    it('should display "Thinking" for thinking status', () => {
      render(<StatusIndicator status="thinking" />);
      expect(screen.getByText(/Thinking/i)).toBeInTheDocument();
    });

    it('should display "Executing" for executing status', () => {
      render(<StatusIndicator status="executing" />);
      expect(screen.getByText(/Executing/i)).toBeInTheDocument();
    });

    it('should display "Waiting" for waiting status', () => {
      render(<StatusIndicator status="waiting" />);
      expect(screen.getByText(/Waiting/i)).toBeInTheDocument();
    });

    it('should display "Responding" for streaming status', () => {
      render(<StatusIndicator status="streaming" />);
      expect(screen.getByText(/Responding/i)).toBeInTheDocument();
    });

    it('should display "Error" for error status', () => {
      render(<StatusIndicator status="error" />);
      expect(screen.getByText(/Error/i)).toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('should render in compact mode', () => {
      render(<StatusIndicator status="idle" compact />);
      // Compact mode just affects styling, verify text is present
      expect(screen.getByText(/Online/i)).toBeInTheDocument();
    });

    it('should render in normal mode by default', () => {
      const { container } = render(<StatusIndicator status="idle" />);
      const statusElement = container.querySelector('[class*="gap-"]');
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      const { container } = render(<StatusIndicator status="idle" className="custom-class" />);
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('should have green color for idle status', () => {
      const { container } = render(<StatusIndicator status="idle" />);
      const indicator = container.querySelector('.bg-green-500');
      expect(indicator).toBeInTheDocument();
    });

    it('should have red color for offline status', () => {
      const { container } = render(<StatusIndicator status="offline" />);
      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).toBeInTheDocument();
    });

    it('should have blue color for thinking status', () => {
      const { container } = render(<StatusIndicator status="thinking" />);
      const indicator = container.querySelector('.bg-blue-500');
      expect(indicator).toBeInTheDocument();
    });

    it('should have yellow color for executing status', () => {
      const { container } = render(<StatusIndicator status="executing" />);
      const indicator = container.querySelector('.bg-yellow-500');
      expect(indicator).toBeInTheDocument();
    });

    it('should have orange color for waiting status', () => {
      const { container } = render(<StatusIndicator status="waiting" />);
      const indicator = container.querySelector('.bg-orange-500');
      expect(indicator).toBeInTheDocument();
    });

    it('should have purple color for streaming status', () => {
      const { container } = render(<StatusIndicator status="streaming" />);
      const indicator = container.querySelector('.bg-purple-500');
      expect(indicator).toBeInTheDocument();
    });

    it('should have red color for error status', () => {
      const { container } = render(<StatusIndicator status="error" />);
      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('should animate thinking status', () => {
      const { container } = render(<StatusIndicator status="thinking" />);
      const indicator = container.querySelector('.animate-pulse');
      expect(indicator).toBeInTheDocument();
    });

    it('should animate executing status', () => {
      const { container } = render(<StatusIndicator status="executing" />);
      const indicator = container.querySelector('.animate-pulse');
      expect(indicator).toBeInTheDocument();
    });

    it('should animate streaming status', () => {
      const { container } = render(<StatusIndicator status="streaming" />);
      const indicator = container.querySelector('.animate-breathing');
      expect(indicator).toBeInTheDocument();
    });
  });
});

// Helper function to get expected label for status
function getStatusLabel(status: StatusType): string {
  const labels: Record<StatusType, string> = {
    idle: 'Online',
    offline: 'Offline',
    thinking: 'Thinking',
    executing: 'Executing',
    waiting: 'Waiting',
    streaming: 'Responding',
    error: 'Error',
  };
  return labels[status];
}
