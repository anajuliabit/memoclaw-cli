import { describe, test, expect } from 'bun:test';
import { parseArgs } from '../src/args';

describe('diff command args', () => {
  test('--all is boolean', () => {
    const args = parseArgs(['diff', 'abc123', '--all']);
    expect(args._).toEqual(['diff', 'abc123']);
    expect(args.all).toBe(true);
  });

  test('--revision takes a value', () => {
    const args = parseArgs(['diff', 'abc123', '--revision', '2']);
    expect(args._).toEqual(['diff', 'abc123']);
    expect(args.revision).toBe('2');
  });

  test('--json flag works with diff', () => {
    const args = parseArgs(['diff', 'abc123', '--json']);
    expect(args.json).toBe(true);
  });
});

describe('retry args', () => {
  test('--no-retry is boolean', () => {
    const args = parseArgs(['list', '--no-retry']);
    expect(args.noRetry).toBe(true);
  });

  test('--retries takes a value', () => {
    const args = parseArgs(['recall', 'query', '--retries', '5']);
    expect(args.retries).toBe('5');
  });

  test('--retries 0 disables retries', () => {
    const args = parseArgs(['store', 'text', '--retries', '0']);
    expect(args.retries).toBe('0');
  });
});

describe('date filter args', () => {
  test('--since takes a value', () => {
    const args = parseArgs(['list', '--since', '7d']);
    expect(args.since).toBe('7d');
  });

  test('--until takes a value', () => {
    const args = parseArgs(['list', '--until', '2025-01-01']);
    expect(args.until).toBe('2025-01-01');
  });

  test('--since and --until together', () => {
    const args = parseArgs(['list', '--since', '7d', '--until', '1d']);
    expect(args.since).toBe('7d');
    expect(args.until).toBe('1d');
  });
});
