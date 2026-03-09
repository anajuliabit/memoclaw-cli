import { describe, test, expect } from 'bun:test';
import { printHelp } from '../src/help';

describe('printHelp', () => {
  test('does not throw for main help', () => {
    expect(() => printHelp()).not.toThrow();
  });

  const commands = [
    'store', 'recall', 'list', 'search', 'context', 'get', 'update', 'delete',
    'pin', 'unpin', 'lock', 'unlock', 'edit', 'watch', 'ingest', 'extract', 'consolidate', 'relations', 'suggested',
    'export', 'import', 'stats', 'config', 'browse', 'graph', 'purge', 'count',
    'completions', 'history', 'tags', 'namespace', 'init', 'migrate',
  ];

  for (const cmd of commands) {
    test(`does not throw for "${cmd}" subhelp`, () => {
      expect(() => printHelp(cmd)).not.toThrow();
    });
  }

  test('handles unknown command gracefully', () => {
    expect(() => printHelp('nonexistent')).not.toThrow();
  });
});
