import { describe, it, expect } from 'vitest';
import type { ChatMessage, ApprovalRequest, BackendStatus, TerminalSession } from '../types';

describe('types', () => {
  describe('ChatMessage', () => {
    it('should have correct structure for user message', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'user',
        content: 'Hello',
        createdAt: new Date().toISOString(),
      };

      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
      expect(message.id).toBe('1');
    });

    it('should have correct structure for assistant message', () => {
      const message: ChatMessage = {
        id: '2',
        role: 'assistant',
        content: 'Hi there!',
        createdAt: new Date().toISOString(),
        streaming: false,
      };

      expect(message.role).toBe('assistant');
      expect(message.content).toBe('Hi there!');
      expect(message.streaming).toBe(false);
    });

    it('should have correct structure for tool message', () => {
      const message: ChatMessage = {
        id: '3',
        role: 'tool',
        content: 'Running: ls -la',
        createdAt: new Date().toISOString(),
        toolName: 'run_shell',
        toolStatus: 'executing',
      };

      expect(message.role).toBe('tool');
      expect(message.toolName).toBe('run_shell');
      expect(message.toolStatus).toBe('executing');
    });
  });

  describe('BackendStatus', () => {
    it('should accept valid status values', () => {
      const statuses: BackendStatus[] = ['idle', 'starting', 'ready', 'error'];
      
      statuses.forEach(status => {
        expect(['idle', 'starting', 'ready', 'error']).toContain(status);
      });
    });
  });

  describe('ApprovalRequest', () => {
    it('should have correct structure for shell approval', () => {
      const request: ApprovalRequest = {
        requestId: 'req1',
        action: 'shell',
        command: 'ls -la',
        description: 'List files',
      };

      expect(request.action).toBe('shell');
      expect(request.command).toBe('ls -la');
      expect(request.requestId).toBe('req1');
    });

    it('should have correct structure for file write approval', () => {
      const request: ApprovalRequest = {
        requestId: 'req2',
        action: 'write',
        path: '/tmp/test.txt',
        description: 'Write to file',
      };

      expect(request.action).toBe('write');
      expect(request.path).toBe('/tmp/test.txt');
    });
  });

  describe('TerminalSession', () => {
    it('should have correct structure', () => {
      const session: TerminalSession = {
        sessionId: 'sess1',
        command: 'ls -la',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        output: [
          { stream: 'stdout', text: 'Hello' },
          { stream: 'stderr', text: 'Error' },
        ],
        status: 'running',
        exitCode: 0,
      };

      expect(session.sessionId).toBe('sess1');
      expect(session.output).toHaveLength(2);
      expect(session.exitCode).toBe(0);
    });

    it('should handle null exit code', () => {
      const session: TerminalSession = {
        sessionId: 'sess2',
        command: 'test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        output: [],
        status: 'running',
        exitCode: null,
      };

      expect(session.exitCode).toBeNull();
    });
  });
});
