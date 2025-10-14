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

// Reset mocks before each test
beforeEach(() => {
  mockTauriInvoke.mockClear();
  mockTauriListen.mockClear();
  mockTauriEmit.mockClear();
});
