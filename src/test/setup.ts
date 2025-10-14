import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Mock Tauri API
const mockTauriInvoke = vi.fn();
const mockTauriListen = vi.fn(() => Promise.resolve(() => {}));
const mockTauriEmit = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockTauriInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockTauriListen,
  emit: mockTauriEmit,
}));

// Mock DOM methods
beforeEach(() => {
  mockTauriInvoke.mockClear();
  mockTauriListen.mockClear();
  mockTauriEmit.mockClear();
  
  // Mock scrollTo for scroll areas
  Element.prototype.scrollTo = vi.fn();
  window.scrollTo = vi.fn();
  
  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
  
  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});
