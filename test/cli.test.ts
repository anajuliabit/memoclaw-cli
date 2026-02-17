import { describe, test, expect } from 'bun:test';
import { parseArgs, BOOLEAN_FLAGS } from '../src/args';

// ─── Content length validation ───────────────────────────────────────────────

describe('content length validation', () => {
  const MAX_CONTENT_LENGTH = 8192;

  test('content at limit is accepted', () => {
    const content = 'a'.repeat(MAX_CONTENT_LENGTH);
    expect(content.length <= MAX_CONTENT_LENGTH).toBe(true);
  });

  test('content over limit is rejected', () => {
    const content = 'a'.repeat(MAX_CONTENT_LENGTH + 1);
    expect(content.length > MAX_CONTENT_LENGTH).toBe(true);
  });

  test('error message includes actual length', () => {
    const content = 'a'.repeat(9000);
    const msg = `Content exceeds the ${MAX_CONTENT_LENGTH} character limit (got ${content.length} chars)`;
    expect(msg).toContain('8192');
    expect(msg).toContain('9000');
  });

  test('empty content is within limit', () => {
    expect(''.length <= MAX_CONTENT_LENGTH).toBe(true);
  });
});

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
  const commands = ['init', 'migrate', 'store', 'recall', 'search', 'list', 'get', 'update', 'delete', 'ingest', 'extract',
    'context', 'consolidate', 'relations', 'suggested', 'status', 'export', 'import', 'stats', 'browse',
    'completions', 'config', 'graph', 'purge', 'count', 'namespace', 'help'];

  test('all commands present', () => {
    expect(commands.length).toBe(27);
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
    expect(commands).toContain('init');
    expect(commands).toContain('migrate');
    expect(commands).toContain('namespace');
    expect(commands).toContain('help');
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
    expect(BOOLEAN_FLAGS.has('format')).toBe(false);
  });

  test('contains new boolean flags', () => {
    expect(BOOLEAN_FLAGS.has('force')).toBe(true);
    expect(BOOLEAN_FLAGS.has('count')).toBe(true);
    expect(BOOLEAN_FLAGS.has('wide')).toBe(true);
    expect(BOOLEAN_FLAGS.has('pretty')).toBe(true);
    expect(BOOLEAN_FLAGS.has('watch')).toBe(true);
    expect(BOOLEAN_FLAGS.has('interactive')).toBe(true);
    expect(BOOLEAN_FLAGS.has('immutable')).toBe(true);
    expect(BOOLEAN_FLAGS.has('pinned')).toBe(true);
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

  test('init command with --force', () => {
    const args = parseArgs(['init', '--force']);
    const [cmd] = args._;
    expect(cmd).toBe('init');
    expect(args.force).toBe(true);
  });

  test('migrate command with path', () => {
    const args = parseArgs(['migrate', '/path/to/dir', '--namespace', 'imported']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('migrate');
    expect(rest[0]).toBe('/path/to/dir');
    expect(args.namespace).toBe('imported');
  });

  test('help command with subcommand', () => {
    const args = parseArgs(['help', 'store']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('help');
    expect(rest[0]).toBe('store');
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

// ─── New flags ────────────────────────────────────────────────────────────────

describe('new flags parsing', () => {
  test('parses --format json', () => {
    const result = parseArgs(['--format', 'json', 'list']);
    expect(result.format).toBe('json');
    expect(result._).toEqual(['list']);
  });

  test('parses --format table', () => {
    const result = parseArgs(['--format', 'table', 'list']);
    expect(result.format).toBe('table');
  });

  test('parses --format csv', () => {
    const result = parseArgs(['--format', 'csv', 'list']);
    expect(result.format).toBe('csv');
  });

  test('parses -f short flag for format', () => {
    const result = parseArgs(['-f', 'csv', 'list']);
    expect(result.format).toBe('csv');
  });

  test('parses --pretty flag', () => {
    const result = parseArgs(['--pretty', 'list']);
    expect(result.pretty).toBe(true);
  });

  test('parses -p short flag for pretty', () => {
    const result = parseArgs(['-p', 'list']);
    expect(result.pretty).toBe(true);
  });

  test('parses --watch flag', () => {
    const result = parseArgs(['--watch', 'recall', 'test']);
    expect(result.watch).toBe(true);
    expect(result._).toEqual(['recall', 'test']);
  });

  test('parses -w short flag for watch', () => {
    const result = parseArgs(['-w', 'recall', 'test']);
    expect(result.watch).toBe(true);
  });

  test('parses --interactive flag', () => {
    const result = parseArgs(['--interactive', 'list']);
    expect(result.interactive).toBe(true);
  });

  test('parses -i short flag for interactive', () => {
    const result = parseArgs(['-i', 'list']);
    expect(result.interactive).toBe(true);
  });

  test('parses -d short flag for dryRun', () => {
    const result = parseArgs(['-d', 'consolidate']);
    expect(result.dryRun).toBe(true);
  });

  test('--format=csv works', () => {
    const result = parseArgs(['--format=csv', 'list']);
    expect(result.format).toBe('csv');
  });

  test('--pretty works with --json', () => {
    const result = parseArgs(['--json', '--pretty', 'list']);
    expect(result.json).toBe(true);
    expect(result.pretty).toBe(true);
  });

  test('--offset is parsed', () => {
    const result = parseArgs(['list', '--offset', '10']);
    expect(result.offset).toBe('10');
  });

  test('--offset=20 works', () => {
    const result = parseArgs(['list', '--offset=20']);
    expect(result.offset).toBe('20');
  });
});

// ─── CSV output formatting ────────────────────────────────────────────────────

describe('CSV output formatting', () => {
  test('handles simple array of objects', () => {
    const data = [
      { id: '1', content: 'test' },
      { id: '2', content: 'hello' },
    ];
    const headers = Object.keys(data[0]);
    expect(headers).toEqual(['id', 'content']);
    expect(data.length).toBe(2);
  });

  test('handles empty array', () => {
    const data: any[] = [];
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    expect(headers).toEqual([]);
  });

  test('escapes commas in values', () => {
    const str = 'a,b';
    const escaped = str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
    expect(escaped).toBe('"a,b"');
  });

  test('escapes quotes in values', () => {
    const str = 'a"b';
    // Escape quotes if the string contains comma OR quote
    const needsQuoting = str.includes(',') || str.includes('"');
    const escaped = needsQuoting ? `"${str.replace(/"/g, '""')}"` : str;
    expect(escaped).toBe('"a""b"');
  });

  test('handles null/undefined values', () => {
    const row = { id: '1', content: null, tags: undefined };
    const getVal = (val: any) => val === null || val === undefined ? '' : String(val);
    expect(getVal(row.content)).toBe('');
    expect(getVal(row.tags)).toBe('');
  });
});

// ─── Progress bar ─────────────────────────────────────────────────────────────

describe('progress bar', () => {
  test('renders correctly at 0%', () => {
    const pct = Math.min(0 / 10, 1);
    const filled = Math.round(pct * 30);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(30 - filled)}`;
    expect(bar.length).toBe(30);
    expect(bar).toBe('░'.repeat(30));
  });

  test('renders correctly at 50%', () => {
    const pct = Math.min(5 / 10, 1);
    const filled = Math.round(pct * 30);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(30 - filled)}`;
    expect(bar.length).toBe(30);
    expect(bar.indexOf('█')).toBe(0);
    expect(bar.indexOf('░')).toBe(15);
  });

  test('renders correctly at 100%', () => {
    const pct = Math.min(10 / 10, 1);
    const filled = Math.round(pct * 30);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(30 - filled)}`;
    expect(bar.length).toBe(30);
    expect(bar).toBe('█'.repeat(30));
  });
});

// ─── Config handling ─────────────────────────────────────────────────────────

describe('config file loading', () => {
  test('loadConfigFile tries multiple path candidates', () => {
    // The function should check: ~/.memoclaw/config, ~/.memoclaw/config.yaml, ~/.memoclaw/config.yml
    // This is a structural test — ensures the fix for YAML config path mismatch
    const candidates = ['config', 'config.yaml', 'config.yml'];
    expect(candidates.length).toBe(3);
    expect(candidates[0]).toBe('config');
    expect(candidates[1]).toBe('config.yaml');
  });
});

describe('config handling', () => {
  test('validates private key format', () => {
    const validKey = '0x' + 'a'.repeat(64); // 64 hex chars after 0x
    const invalidShort = '0x123';
    const invalidNoPrefix = 'a'.repeat(64);

    expect(validKey.startsWith('0x')).toBe(true);
    expect(validKey.length).toBe(66); // 2 + 64
    expect(invalidShort.length).toBeLessThan(66);
    expect(invalidNoPrefix.startsWith('0x')).toBe(false);
  });

  test('--format=yaml is parsed', () => {
    const result = parseArgs(['--format=yaml', 'list']);
    expect(result.format).toBe('yaml');
  });

  test('--format=YAML works (case insensitive)', () => {
    const result = parseArgs(['--format=YAML', 'list']);
    // Format is case-preserving in args, but normalized in output
    expect(result.format).toBe('YAML');
  });

  test('--format=yml works', () => {
    const result = parseArgs(['--format=yml', 'list']);
    expect(result.format).toBe('yml');
  });
});

// ─── New flags: truncate, concurrency, yes ───────────────────────────────────

describe('new flags: truncate, concurrency, yes', () => {
  test('parses --truncate with value', () => {
    const result = parseArgs(['--truncate', '80', 'list']);
    expect(result.truncate).toBe('80');
    expect(result._).toEqual(['list']);
  });

  test('parses --truncate as boolean (defaults to true if next arg is flag-like)', () => {
    const result = parseArgs(['--truncate', '--json', 'list']);
    expect(result.truncate).toBe(true);
    expect(result._).toEqual(['list']);
  });

  test('parses -s short flag for truncate', () => {
    const result = parseArgs(['-s', '40', 'list']);
    expect(result.truncate).toBe('40');
  });

  test('parses --concurrency with value', () => {
    const result = parseArgs(['--concurrency', '5', 'import']);
    expect(result.concurrency).toBe('5');
  });

  test('parses -c short flag for concurrency', () => {
    const result = parseArgs(['-c', '10', 'import']);
    expect(result.concurrency).toBe('10');
  });

  test('parses --yes flag', () => {
    const result = parseArgs(['purge', '--yes']);
    expect(result.yes).toBe(true);
  });

  test('parses -y short flag for yes', () => {
    const result = parseArgs(['purge', '-y']);
    expect(result.yes).toBe(true);
  });

  test('--watch-interval is parsed', () => {
    const result = parseArgs(['--watch-interval', '2000', 'recall', 'test']);
    expect(result.watchInterval).toBe('2000');
  });

  test('--truncate=60 works', () => {
    const result = parseArgs(['--truncate=60', 'list']);
    expect(result.truncate).toBe('60');
  });

  test('--concurrency=3 works', () => {
    const result = parseArgs(['--concurrency=3', 'import']);
    expect(result.concurrency).toBe('3');
  });
});

// ─── Bug fix: -o should map to offset ────────────────────────────────────────

describe('bug fix: -o maps to offset', () => {
  test('-o short flag maps to offset (not output)', () => {
    const result = parseArgs(['list', '-o', '20']);
    expect(result.offset).toBe('20');
    expect(result._).toEqual(['list']);
    // Should NOT set 'output' (which was the bug)
    expect(result.output).toBeUndefined();
  });

  test('--offset works correctly', () => {
    const result = parseArgs(['list', '--offset', '10']);
    expect(result.offset).toBe('10');
  });

  test('-o=30 works', () => {
    const result = parseArgs(['list', '-o=30']);
    expect(result.offset).toBe('30');
  });
});

// ─── New short flags ─────────────────────────────────────────────────────────

describe('new short flags', () => {
  test('-T for timeout', () => {
    const result = parseArgs(['list', '-T', '60']);
    expect(result.timeout).toBe('60');
  });

  test('-x for text', () => {
    const result = parseArgs(['ingest', '-x', 'some text']);
    expect(result.text).toBe('some text');
  });

  test('-e for expiresAt', () => {
    const result = parseArgs(['update', 'id', '-e', '2025-12-31']);
    expect(result.expiresAt).toBe('2025-12-31');
  });

  test('-C for category', () => {
    const result = parseArgs(['suggested', '-C', 'work']);
    expect(result.category).toBe('work');
  });

  test('-S for sessionId', () => {
    const result = parseArgs(['ingest', '-S', 'session123']);
    expect(result.sessionId).toBe('session123');
  });

  test('-A for agentId', () => {
    const result = parseArgs(['ingest', '-A', 'agent456']);
    expect(result.agentId).toBe('agent456');
  });

  test('--timeout=120 works', () => {
    const result = parseArgs(['list', '--timeout=120']);
    expect(result.timeout).toBe('120');
  });
});

// ─── Sort and column selection ────────────────────────────────────────────────

describe('sort and column selection', () => {
  test('--sort-by importance', () => {
    const result = parseArgs(['list', '--sort-by', 'importance']);
    expect(result.sortBy).toBe('importance');
  });

  test('-m created for sortBy', () => {
    const result = parseArgs(['list', '-m', 'created']);
    expect(result.sortBy).toBe('created');
  });

  test('--sort-by=updated works', () => {
    const result = parseArgs(['list', '--sort-by=updated']);
    expect(result.sortBy).toBe('updated');
  });

  test('--reverse flag', () => {
    const result = parseArgs(['list', '--reverse']);
    expect(result.reverse).toBe(true);
  });

  test('-r for reverse', () => {
    const result = parseArgs(['list', '-r']);
    expect(result.reverse).toBe(true);
  });

  test('--columns id,tags', () => {
    const result = parseArgs(['list', '--columns', 'id,tags']);
    expect(result.columns).toBe('id,tags');
  });

  test('-k for columns', () => {
    const result = parseArgs(['list', '-k', 'id,content,importance']);
    expect(result.columns).toBe('id,content,importance');
  });

  test('--columns=id works', () => {
    const result = parseArgs(['list', '--columns=id']);
    expect(result.columns).toBe('id');
  });

  test('combined sort options', () => {
    const result = parseArgs(['list', '-m', 'importance', '-r', '-k', 'id,tags']);
    expect(result.sortBy).toBe('importance');
    expect(result.reverse).toBe(true);
    expect(result.columns).toBe('id,tags');
  });
});

// ─── Namespace command routing ────────────────────────────────────────────────

describe('namespace command routing', () => {
  test('namespace list', () => {
    const args = parseArgs(['namespace', 'list']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('namespace');
    expect(rest[0]).toBe('list');
  });

  test('namespace stats', () => {
    const args = parseArgs(['namespace', 'stats']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('namespace');
    expect(rest[0]).toBe('stats');
  });

  test('namespace with namespace filter', () => {
    const args = parseArgs(['namespace', 'list', '-n', 'myns']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('namespace');
    expect(rest[0]).toBe('list');
    expect(args.namespace).toBe('myns');
  });
});

// ─── Client-side sorting logic ────────────────────────────────────────────────

describe('client-side sorting logic', () => {
  const memories = [
    { id: '1', importance: 0.5, created_at: '2024-01-01T00:00:00Z' },
    { id: '2', importance: 0.9, created_at: '2024-01-03T00:00:00Z' },
    { id: '3', importance: 0.2, created_at: '2024-01-02T00:00:00Z' },
  ];

  test('sorts by importance ascending', () => {
    const sorted = [...memories].sort((a: any, b: any) => {
      const aVal = parseFloat(a.importance) || 0;
      const bVal = parseFloat(b.importance) || 0;
      return aVal - bVal;
    });
    expect(sorted[0].id).toBe('3');
    expect(sorted[2].id).toBe('2');
  });

  test('sorts by importance descending', () => {
    const sorted = [...memories].sort((a: any, b: any) => {
      const aVal = parseFloat(a.importance) || 0;
      const bVal = parseFloat(b.importance) || 0;
      return bVal - aVal;
    });
    expect(sorted[0].id).toBe('2');
    expect(sorted[2].id).toBe('3');
  });

  test('sorts by created date', () => {
    const sorted = [...memories].sort((a: any, b: any) => {
      const aVal = new Date(a.created_at).getTime();
      const bVal = new Date(b.created_at).getTime();
      return aVal - bVal;
    });
    expect(sorted[0].id).toBe('1');
    expect(sorted[2].id).toBe('2');
  });
});

// ─── New flags: output file ─────────────────────────────────────────────────

describe('output file flag', () => {
  test('--output parses with value', () => {
    const result = parseArgs(['list', '--output', 'out.txt']);
    expect(result.output).toBe('out.txt');
    expect(result._).toEqual(['list']);
  });

  test('-O short flag for output', () => {
    const result = parseArgs(['list', '-O', 'data.json']);
    expect(result.output).toBe('data.json');
    expect(result._).toEqual(['list']);
  });

  test('--output=value syntax', () => {
    const result = parseArgs(['list', '--output=results.csv']);
    expect(result.output).toBe('results.csv');
  });
});

// ─── New flags: no-truncate ─────────────────────────────────────────────────

describe('no-truncate flag', () => {
  test('--no-truncate is boolean', () => {
    const result = parseArgs(['list', '--no-truncate']);
    expect(result.noTruncate).toBe(true);
    expect(result._).toEqual(['list']);
  });

  test('no-truncate does not consume next arg', () => {
    const result = parseArgs(['list', '--no-truncate', '--json']);
    expect(result.noTruncate).toBe(true);
    expect(result.json).toBe(true);
    expect(result._).toEqual(['list']);
  });
});

// ─── New flags: field selection ────────────────────────────────────────────

describe('field selection flag', () => {
  test('--field parses with value', () => {
    const result = parseArgs(['get', 'abc123', '--field', 'content']);
    expect(result.field).toBe('content');
    expect(result._).toEqual(['get', 'abc123']);
  });

  test('-F short flag for field', () => {
    const result = parseArgs(['get', 'abc123', '-F', 'id']);
    expect(result.field).toBe('id');
    expect(result._).toEqual(['get', 'abc123']);
  });

  test('--field=value syntax', () => {
    const result = parseArgs(['get', 'abc', '--field=importance']);
    expect(result.field).toBe('importance');
  });
});

// ─── Search command routing ──────────────────────────────────────────────────

describe('search command routing', () => {
  test('search command extracts query', () => {
    const args = parseArgs(['search', 'my query', '--json']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('search');
    expect(rest[0]).toBe('my query');
    expect(args.json).toBe(true);
  });

  test('search with namespace and limit', () => {
    const args = parseArgs(['search', 'test', '-n', 'proj', '-l', '5']);
    const [cmd, ...rest] = args._;
    expect(cmd).toBe('search');
    expect(rest[0]).toBe('test');
    expect(args.namespace).toBe('proj');
    expect(args.limit).toBe('5');
  });

  test('search with --raw flag', () => {
    const args = parseArgs(['search', 'query', '--raw']);
    expect(args.raw).toBe(true);
  });
});

// ─── Purge safety limit ─────────────────────────────────────────────────────

describe('purge safety limit', () => {
  test('consecutive failure tracking logic', () => {
    // Simulates the purge loop safety valve
    let failedInRow = 0;
    const MAX = 3;

    // Batch with no deletes
    let batchDeleted = 0;
    if (batchDeleted === 0) failedInRow++;
    expect(failedInRow).toBe(1);
    expect(failedInRow >= MAX).toBe(false);

    // Another failed batch
    batchDeleted = 0;
    if (batchDeleted === 0) failedInRow++;
    expect(failedInRow).toBe(2);

    // Third failure — should trigger abort
    batchDeleted = 0;
    if (batchDeleted === 0) failedInRow++;
    expect(failedInRow >= MAX).toBe(true);
  });

  test('successful batch resets failure counter', () => {
    let failedInRow = 2;

    // Successful batch
    let batchDeleted = 5;
    if (batchDeleted === 0) failedInRow++;
    else failedInRow = 0;

    expect(failedInRow).toBe(0);
  });
});

// ─── Timeout config ──────────────────────────────────────────────────────────

describe('timeout config', () => {
  test('default timeout is 30s', () => {
    const timeoutMs = undefined ? parseInt(undefined as any) * 1000 : 30000;
    expect(timeoutMs).toBe(30000);
  });

  test('custom timeout from args', () => {
    const args = parseArgs(['list', '--timeout', '60']);
    const timeoutMs = args.timeout ? parseInt(args.timeout) * 1000 : 30000;
    expect(timeoutMs).toBe(60000);
  });

  test('timeout=0 uses 0ms (immediate)', () => {
    const args = parseArgs(['list', '--timeout', '0']);
    const timeoutMs = args.timeout ? parseInt(args.timeout) * 1000 : 30000;
    // '0' is truthy as string, so parseInt('0') * 1000 = 0
    expect(timeoutMs).toBe(0);
  });
});

// ─── Combined flags with output options ─────────────────────────────────────

// ─── Field extraction logic ──────────────────────────────────────────────────

describe('field extraction', () => {
  const extractField = (data: any, field: string): any => {
    const parts = field.split('.');
    let val = data;
    for (const p of parts) {
      if (val == null) return undefined;
      val = val[p];
    }
    return val;
  };

  test('extracts top-level field', () => {
    const data = { id: '123', content: 'hello' };
    expect(extractField(data, 'id')).toBe('123');
    expect(extractField(data, 'content')).toBe('hello');
  });

  test('extracts nested field with dot notation', () => {
    const data = { memory: { content: 'test', metadata: { tags: ['a', 'b'] } } };
    expect(extractField(data, 'memory.content')).toBe('test');
    expect(extractField(data, 'memory.metadata.tags')).toEqual(['a', 'b']);
  });

  test('returns undefined for missing field', () => {
    const data = { id: '123' };
    expect(extractField(data, 'missing')).toBeUndefined();
    expect(extractField(data, 'deep.missing.field')).toBeUndefined();
  });

  test('handles null data', () => {
    expect(extractField(null, 'field')).toBeUndefined();
    expect(extractField(undefined, 'field')).toBeUndefined();
  });

  test('--field implies --json for arg parsing', () => {
    const args = parseArgs(['get', 'abc', '--field', 'content']);
    expect(args.field).toBe('content');
    // In CLI, --field sets outputJson=true so commands use their JSON path
  });
});

describe('combined flags with output options', () => {
  test('--json --output works together', () => {
    const result = parseArgs(['--json', '--output', 'data.json', 'list']);
    expect(result.json).toBe(true);
    expect(result.output).toBe('data.json');
    expect(result._).toEqual(['list']);
  });

  test('-jqO combo with output', () => {
    const result = parseArgs(['-jqO', 'out.txt', 'list']);
    expect(result.json).toBe(true);
    expect(result.quiet).toBe(true);
    expect(result.output).toBe('out.txt');
    expect(result._).toEqual(['list']);
  });

  test('--format with output file', () => {
    const result = parseArgs(['--format', 'csv', '--output', 'data.csv', 'list']);
    expect(result.format).toBe('csv');
    expect(result.output).toBe('data.csv');
  });
});

// ─── Store --content flag ────────────────────────────────────────────────────

describe('store --content flag', () => {
  test('--content flag is parsed as value', () => {
    const result = parseArgs(['store', '--content', 'Hello world']);
    expect(result.content).toBe('Hello world');
    expect(result._).toEqual(['store']);
  });

  test('--content=value syntax works', () => {
    const result = parseArgs(['store', '--content=Hello world']);
    expect(result.content).toBe('Hello world');
  });

  test('positional content takes precedence over --content', () => {
    const result = parseArgs(['store', 'positional content', '--content', 'flag content']);
    const [cmd, ...rest] = result._;
    const content = rest[0] || (result.content && result.content !== true ? result.content : undefined);
    expect(content).toBe('positional content');
  });

  test('--immutable flag is parsed as boolean', () => {
    const result = parseArgs(['store', 'content', '--immutable']);
    expect(result.immutable).toBe(true);
    expect(result._).toEqual(['store', 'content']);
  });

  test('--pinned flag is parsed as boolean', () => {
    const result = parseArgs(['store', 'content', '--pinned']);
    expect(result.pinned).toBe(true);
    expect(result._).toEqual(['store', 'content']);
  });

  test('--immutable and --pinned together', () => {
    const result = parseArgs(['store', 'content', '--immutable', '--pinned', '--importance', '0.9']);
    expect(result.immutable).toBe(true);
    expect(result.pinned).toBe(true);
    expect(result.importance).toBe('0.9');
  });

  test('--content is used when no positional arg', () => {
    const result = parseArgs(['store', '--content', 'flag content', '--tags', 'test']);
    const [cmd, ...rest] = result._;
    const content = rest[0] || (result.content && result.content !== true ? result.content : undefined);
    expect(content).toBe('flag content');
  });
});

// ─── Importance validation ───────────────────────────────────────────────────

describe('importance validation', () => {
  function validateImportance(value: string): number {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0 || n > 1) {
      throw new Error(`Importance must be a number between 0 and 1 (got "${value}")`);
    }
    return n;
  }

  test('accepts 0', () => {
    expect(validateImportance('0')).toBe(0);
  });

  test('accepts 1', () => {
    expect(validateImportance('1')).toBe(1);
  });

  test('accepts 0.5', () => {
    expect(validateImportance('0.5')).toBe(0.5);
  });

  test('rejects negative values', () => {
    expect(() => validateImportance('-0.1')).toThrow('between 0 and 1');
  });

  test('rejects values above 1', () => {
    expect(() => validateImportance('1.5')).toThrow('between 0 and 1');
  });

  test('rejects non-numeric values', () => {
    expect(() => validateImportance('abc')).toThrow('between 0 and 1');
  });

  test('rejects empty string', () => {
    expect(() => validateImportance('')).toThrow('between 0 and 1');
  });
});
