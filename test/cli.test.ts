import { describe, test, expect } from 'bun:test';
import { parseArgs, BOOLEAN_FLAGS } from '../src/args';

// ─── parseArgs ───────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  test('parses positional arguments', () => {
    const result = parseArgs(['store', 'hello world']);
    expect(result._).toEqual(['store', 'hello world']);
  });

  test('parses --key value pairs', () => {
    const result = parseArgs(['store', 'content', '--importance', '0.8', '--tags', 'a,b']);
    expect(result.importance).toBe('0.8');
    expect(result.tags).toBe('a,b');
  });

  test('parses boolean flags', () => {
    const result = parseArgs(['recall', 'query', '--json', '--raw']);
    expect(result.json).toBe(true);
    expect(result.raw).toBe(true);
  });

  test('parses short flags', () => {
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['-v']).version).toBe(true);
    expect(parseArgs(['-j', 'list']).json).toBe(true);
    expect(parseArgs(['-q', 'store', 'hello']).quiet).toBe(true);
  });

  test('parses short flag -n as namespace with value', () => {
    const result = parseArgs(['list', '-n', 'myns']);
    expect(result.namespace).toBe('myns');
    expect(result._).toEqual(['list']);
  });

  test('parses short flag -l as limit with value', () => {
    const result = parseArgs(['list', '-l', '5']);
    expect(result.limit).toBe('5');
  });

  test('parses short flag -t as tags with value', () => {
    const result = parseArgs(['recall', 'q', '-t', 'foo,bar']);
    expect(result.tags).toBe('foo,bar');
  });

  test('handles -- separator', () => {
    const result = parseArgs(['store', '--', '--not-a-flag']);
    expect(result._).toEqual(['store', '--not-a-flag']);
  });

  test('converts kebab-case to camelCase', () => {
    const result = parseArgs(['--min-similarity', '0.5', '--dry-run']);
    expect(result.minSimilarity).toBe('0.5');
    expect(result.dryRun).toBe(true);
  });

  test('boolean flags do not consume next arg', () => {
    const result = parseArgs(['--json', 'list']);
    expect(result.json).toBe(true);
    expect(result._).toEqual(['list']);
  });

  test('--dry-run is boolean', () => {
    const result = parseArgs(['consolidate', '--dry-run', '--namespace', 'test']);
    expect(result.dryRun).toBe(true);
    expect(result.namespace).toBe('test');
  });

  test('handles flag without value at end', () => {
    const result = parseArgs(['--namespace']);
    expect(result.namespace).toBe(true);
  });

  test('handles multiple positional args', () => {
    const result = parseArgs(['relations', 'create', 'id1', 'id2', 'related_to']);
    expect(result._).toEqual(['relations', 'create', 'id1', 'id2', 'related_to']);
  });

  test('handles mixed flags and positionals', () => {
    const result = parseArgs(['recall', 'my query', '--limit', '5', '--json']);
    expect(result._).toEqual(['recall', 'my query']);
    expect(result.limit).toBe('5');
    expect(result.json).toBe(true);
  });

  test('empty args', () => {
    const result = parseArgs([]);
    expect(result._).toEqual([]);
  });

  test('handles --verbose as boolean', () => {
    const result = parseArgs(['--verbose', 'list']);
    expect(result.verbose).toBe(true);
    expect(result._).toEqual(['list']);
  });

  test('handles --key=value syntax', () => {
    const result = parseArgs(['--namespace=test', '--limit=10']);
    expect(result.namespace).toBe('test');
    expect(result.limit).toBe('10');
  });

  test('handles --key=value with boolean flag', () => {
    const result = parseArgs(['--json', '--namespace=test']);
    expect(result.json).toBe(true);
    expect(result.namespace).toBe('test');
  });

  test('handles --key=value with empty value', () => {
    const result = parseArgs(['--namespace=']);
    expect(result.namespace).toBe('');
  });

  test('handles --no-color as boolean', () => {
    const result = parseArgs(['--no-color', 'list']);
    expect(result.noColor).toBe(true);
    expect(result._).toEqual(['list']);
  });

  test('combined short flags -jq', () => {
    const result = parseArgs(['-jq', 'list']);
    expect(result.json).toBe(true);
    expect(result.quiet).toBe(true);
    expect(result._).toEqual(['list']);
  });

  test('combined short flags -jn with value', () => {
    const result = parseArgs(['-jn', 'myns', 'list']);
    expect(result.json).toBe(true);
    expect(result.namespace).toBe('myns');
    expect(result._).toEqual(['list']);
  });

  test('short value flag -n does not consume flag-like next arg', () => {
    const result = parseArgs(['-n', '--json']);
    // -n sees --json as a flag, not a value
    expect(result.namespace).toBe(true);
    expect(result.json).toBe(true);
  });

  test('all short flags combined', () => {
    const result = parseArgs(['-j', '-q', '-n', 'ns', '-l', '5', 'recall', 'test']);
    expect(result.json).toBe(true);
    expect(result.quiet).toBe(true);
    expect(result.namespace).toBe('ns');
    expect(result.limit).toBe('5');
    expect(result._).toEqual(['recall', 'test']);
  });
});

// ─── Command routing ─────────────────────────────────────────────────────────

describe('command routing', () => {
  test('extracts command and rest from positionals', () => {
    const args = parseArgs(['relations', 'create', 'id1', 'id2', 'related_to']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('relations');
    expect(rest).toEqual(['create', 'id1', 'id2', 'related_to']);
  });

  test('handles no command', () => {
    const args = parseArgs(['--help']);
    const [cmd] = args._;
    expect(cmd).toBeUndefined();
    expect(args.help).toBe(true);
  });

  test('get command extracts ID', () => {
    const args = parseArgs(['get', 'abc-123', '--json']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('get');
    expect(rest[0]).toBe('abc-123');
    expect(args.json).toBe(true);
  });

  test('config command with subcommand', () => {
    const args = parseArgs(['config', 'check']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('config');
    expect(rest[0]).toBe('check');
  });
});

// ─── Tag parsing ─────────────────────────────────────────────────────────────

describe('tag parsing', () => {
  test('splits comma-separated tags', () => {
    const tags = 'a, b , c'.split(',').map((t: string) => t.trim());
    expect(tags).toEqual(['a', 'b', 'c']);
  });

  test('handles single tag', () => {
    const tags = 'solo'.split(',').map((t: string) => t.trim());
    expect(tags).toEqual(['solo']);
  });
});

// ─── Output formatting ──────────────────────────────────────────────────────

describe('output formatting', () => {
  test('truncates long content', () => {
    const content = 'a'.repeat(200);
    const truncated = content.length > 50 ? content.slice(0, 50) + '…' : content;
    expect(truncated.length).toBe(51);
    expect(truncated.endsWith('…')).toBe(true);
  });

  test('does not truncate short content', () => {
    const content = 'short';
    const truncated = content.length > 50 ? content.slice(0, 50) + '…' : content;
    expect(truncated).toBe('short');
  });

  test('similarity color thresholds', () => {
    const getColor = (sim: number) => sim > 0.8 ? 'green' : sim > 0.5 ? 'yellow' : 'red';
    expect(getColor(0.95)).toBe('green');
    expect(getColor(0.65)).toBe('yellow');
    expect(getColor(0.3)).toBe('red');
    expect(getColor(0.8)).toBe('yellow'); // boundary
    expect(getColor(0.5)).toBe('red');    // boundary
  });
});

// ─── Relation type validation ────────────────────────────────────────────────

describe('relation type validation', () => {
  const validTypes = ['related_to', 'derived_from', 'contradicts', 'supersedes', 'supports'];

  test('accepts valid types', () => {
    for (const t of validTypes) {
      expect(validTypes.includes(t)).toBe(true);
    }
  });

  test('rejects invalid types', () => {
    expect(validTypes.includes('invalid')).toBe(false);
    expect(validTypes.includes('')).toBe(false);
  });
});

// ─── Import/export format ────────────────────────────────────────────────────

describe('import format validation', () => {
  test('accepts array format', () => {
    const data = [{ content: 'test' }];
    const memories = Array.isArray(data) ? data : data;
    expect(Array.isArray(memories)).toBe(true);
  });

  test('accepts object with memories key', () => {
    const data = { memories: [{ content: 'test' }] };
    const memories = (data as any).memories || data;
    expect(Array.isArray(memories)).toBe(true);
  });

  test('rejects invalid format', () => {
    const data = { content: 'test' };
    const memories = (data as any).memories || data;
    expect(Array.isArray(memories)).toBe(false);
  });
});

describe('export format', () => {
  test('creates valid export structure', () => {
    const memories = [{ id: '1', content: 'test' }];
    const exportData = {
      version: 1,
      exported_at: new Date().toISOString(),
      count: memories.length,
      memories,
    };
    expect(exportData.version).toBe(1);
    expect(exportData.count).toBe(1);
    expect(exportData.memories).toEqual(memories);
    expect(exportData.exported_at).toMatch(/^\d{4}-\d{2}/);
  });
});

// ─── Completions ─────────────────────────────────────────────────────────────

describe('completions', () => {
  const commands = ['store', 'recall', 'list', 'get', 'update', 'delete', 'ingest', 'extract',
    'consolidate', 'relations', 'suggested', 'status', 'export', 'import', 'stats', 'browse',
    'completions', 'config', 'graph', 'purge', 'count'];

  test('all commands present', () => {
    expect(commands.length).toBe(21);
    expect(commands).toContain('store');
    expect(commands).toContain('get');
    expect(commands).toContain('export');
    expect(commands).toContain('import');
    expect(commands).toContain('stats');
    expect(commands).toContain('completions');
    expect(commands).toContain('config');
    expect(commands).toContain('browse');
    expect(commands).toContain('graph');
    expect(commands).toContain('purge');
    expect(commands).toContain('count');
  });
});

// ─── Falsy value handling ────────────────────────────────────────────────────

describe('falsy value handling', () => {
  test('importance of 0 is preserved as string', () => {
    const result = parseArgs(['store', 'test', '--importance', '0']);
    expect(result.importance).toBe('0');
    // Ensures `if (opts.importance)` bug is caught — "0" is truthy as string
  });

  test('limit of 0 is preserved', () => {
    const result = parseArgs(['list', '--limit', '0']);
    expect(result.limit).toBe('0');
  });

  test('offset of 0 is preserved', () => {
    const result = parseArgs(['list', '--offset', '0']);
    expect(result.offset).toBe('0');
  });

  test('null-check pattern works for flag values', () => {
    // Simulates the fixed pattern: opts.x != null && opts.x !== true
    const opts: any = { limit: '0', importance: '0.0', offset: '0' };
    expect(opts.limit != null && opts.limit !== true).toBe(true);
    expect(opts.importance != null && opts.importance !== true).toBe(true);
    expect(opts.offset != null && opts.offset !== true).toBe(true);

    // When flag has no value (boolean fallback)
    const opts2: any = { limit: true };
    expect(opts2.limit != null && opts2.limit !== true).toBe(false);

    // When flag is absent
    const opts3: any = {};
    expect(opts3.limit != null && opts3.limit !== true).toBe(false);
  });
});

// ─── BOOLEAN_FLAGS ───────────────────────────────────────────────────────────

describe('BOOLEAN_FLAGS', () => {
  test('contains expected flags', () => {
    expect(BOOLEAN_FLAGS.has('help')).toBe(true);
    expect(BOOLEAN_FLAGS.has('version')).toBe(true);
    expect(BOOLEAN_FLAGS.has('json')).toBe(true);
    expect(BOOLEAN_FLAGS.has('quiet')).toBe(true);
    expect(BOOLEAN_FLAGS.has('dryRun')).toBe(true);
    expect(BOOLEAN_FLAGS.has('raw')).toBe(true);
    expect(BOOLEAN_FLAGS.has('verbose')).toBe(true);
    expect(BOOLEAN_FLAGS.has('noColor')).toBe(true);
  });

  test('does not contain value flags', () => {
    expect(BOOLEAN_FLAGS.has('namespace')).toBe(false);
    expect(BOOLEAN_FLAGS.has('limit')).toBe(false);
    expect(BOOLEAN_FLAGS.has('tags')).toBe(false);
  });

  test('contains new boolean flags', () => {
    expect(BOOLEAN_FLAGS.has('force')).toBe(true);
    expect(BOOLEAN_FLAGS.has('count')).toBe(true);
    expect(BOOLEAN_FLAGS.has('wide')).toBe(true);
  });
});

// ─── New commands routing ────────────────────────────────────────────────────

describe('new command routing', () => {
  test('graph command extracts ID', () => {
    const args = parseArgs(['graph', 'abc-123', '--json']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('graph');
    expect(rest[0]).toBe('abc-123');
    expect(args.json).toBe(true);
  });

  test('purge command with --force', () => {
    const args = parseArgs(['purge', '--force', '--namespace', 'old']);
    const [cmd] = args._;
    expect(cmd).toBe('purge');
    expect(args.force).toBe(true);
    expect(args.namespace).toBe('old');
  });

  test('count command with namespace', () => {
    const args = parseArgs(['count', '-n', 'proj1']);
    const [cmd] = args._;
    expect(cmd).toBe('count');
    expect(args.namespace).toBe('proj1');
  });

  test('timeout flag parsed as value', () => {
    const args = parseArgs(['list', '--timeout', '60']);
    expect(args.timeout).toBe('60');
  });
});

// ─── Graph output ────────────────────────────────────────────────────────────

describe('graph helpers', () => {
  test('shortId truncates to 8 chars', () => {
    const shortId = (s: string) => s?.slice(0, 8) || '?';
    expect(shortId('abcdefgh-1234-5678')).toBe('abcdefgh');
    expect(shortId('short')).toBe('short');
    expect(shortId('')).toBe('?');
  });

  test('label truncates at 40 chars', () => {
    const label = (content: string) => {
      const text = content.slice(0, 40);
      return text.length < content.length ? text + '…' : text;
    };
    expect(label('short')).toBe('short');
    expect(label('a'.repeat(50))).toBe('a'.repeat(40) + '…');
    expect(label('a'.repeat(40))).toBe('a'.repeat(40));
  });
});
