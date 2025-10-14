import { describe, it, expect } from 'vitest';
import { cn } from '../lib/utils';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names correctly', () => {
      const result = cn('foo', 'bar');
      expect(result).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      const result = cn('foo', false && 'bar', 'baz');
      expect(result).toBe('foo baz');
    });

    it('should merge Tailwind classes correctly', () => {
      const result = cn('px-2', 'px-4');
      expect(result).toBe('px-4');
    });

    it('should handle arrays', () => {
      const result = cn(['foo', 'bar']);
      expect(result).toBe('foo bar');
    });

    it('should handle objects', () => {
      const result = cn({ foo: true, bar: false, baz: true });
      expect(result).toBe('foo baz');
    });

    it('should handle mixed inputs', () => {
      const result = cn('foo', ['bar', { baz: true, qux: false }], 'quux');
      expect(result).toBe('foo bar baz quux');
    });
  });
});
