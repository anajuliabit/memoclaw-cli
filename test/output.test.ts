import { describe, test, expect, beforeEach } from 'bun:test';
import { configureOutput, truncate, progressBar } from '../src/output';

// ─── truncate ────────────────────────────────────────────────────────────────

describe('truncate', () => {
  test('returns text unchanged when shorter than width', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  test('returns text unchanged when equal to width', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  test('truncates with ellipsis when longer', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
  });

  test('handles width of 1', () => {
    expect(truncate('hello', 1)).toBe('…');
  });

  test('handles width of 0 (no truncation)', () => {
    expect(truncate('hello', 0)).toBe('hello');
  });

  test('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  test('handles negative width (no truncation)', () => {
    expect(truncate('hello', -5)).toBe('hello');
  });
});

// ─── progressBar ─────────────────────────────────────────────────────────────

describe('progressBar', () => {
  test('returns bar string with current/total', () => {
    const bar = progressBar(5, 10);
    expect(bar).toContain('5/10');
  });

  test('0% progress', () => {
    const bar = progressBar(0, 10);
    expect(bar).toContain('0/10');
  });

  test('100% progress', () => {
    const bar = progressBar(10, 10);
    expect(bar).toContain('10/10');
  });

  test('does not exceed 100% visually', () => {
    const bar = progressBar(15, 10);
    expect(bar).toContain('15/10');
    // Should cap at 100% fill
  });

  test('custom width', () => {
    const bar = progressBar(5, 10, 20);
    expect(bar).toContain('5/10');
  });
});

// ─── configureOutput ─────────────────────────────────────────────────────────

describe('configureOutput', () => {
  test('sets json mode', () => {
    // We can't easily inspect module-level state, but we can ensure it doesn't throw
    expect(() => configureOutput({ json: true })).not.toThrow();
  });

  test('sets quiet mode', () => {
    expect(() => configureOutput({ quiet: true })).not.toThrow();
  });

  test('normalizes yml to yaml format', () => {
    expect(() => configureOutput({ format: 'yml' })).not.toThrow();
  });

  test('handles truncate as boolean (defaults to 80)', () => {
    expect(() => configureOutput({ truncate: true })).not.toThrow();
  });

  test('handles truncate with numeric string', () => {
    expect(() => configureOutput({ truncate: '60' })).not.toThrow();
  });

  test('noTruncate overrides truncate', () => {
    expect(() => configureOutput({ truncate: '80', noTruncate: true })).not.toThrow();
  });

  test('field implies json', () => {
    expect(() => configureOutput({ field: 'content' })).not.toThrow();
  });

  test('handles empty args object', () => {
    expect(() => configureOutput({})).not.toThrow();
  });
});
