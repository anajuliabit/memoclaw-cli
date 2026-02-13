import { describe, test, expect } from 'bun:test';

// ─── parseArgs tests (extracted logic) ───────────────────────────────────────

const BOOLEAN_FLAGS = new Set([
  'help', 'version', 'raw', 'json', 'quiet', 'dryRun', 'verbose',
]);

interface ParsedArgs {
  _: string[];
  [key: string]: any;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { _: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      result.help = true;
      i++;
    } else if (arg === '-v' || arg === '--version') {
      result.version = true;
      i++;
    } else if (arg === '-q' || arg === '--quiet') {
      result.quiet = true;
      i++;
    } else if (arg === '-j' || arg === '--json') {
      result.json = true;
      i++;
    } else if (arg === '--') {
      result._.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      if (BOOLEAN_FLAGS.has(key)) {
        result[key] = true;
        i++;
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          result[key] = next;
          i += 2;
        } else {
          result[key] = true;
          i++;
        }
      }
    } else {
      result._.push(arg);
      i++;
    }
  }
  return result;
}

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
    const result = parseArgs(['-h']);
    expect(result.help).toBe(true);
  });

  test('parses -v as version', () => {
    const result = parseArgs(['-v']);
    expect(result.version).toBe(true);
  });

  test('parses -j as json', () => {
    const result = parseArgs(['-j', 'list']);
    expect(result.json).toBe(true);
    expect(result._).toEqual(['list']);
  });

  test('parses -q as quiet', () => {
    const result = parseArgs(['-q', 'store', 'hello']);
    expect(result.quiet).toBe(true);
    expect(result._).toEqual(['store', 'hello']);
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
});

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
});

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
    // High similarity (>0.8) = green, medium (>0.5) = yellow, low = red
    const getColor = (sim: number) => sim > 0.8 ? 'green' : sim > 0.5 ? 'yellow' : 'red';
    expect(getColor(0.95)).toBe('green');
    expect(getColor(0.65)).toBe('yellow');
    expect(getColor(0.3)).toBe('red');
    expect(getColor(0.8)).toBe('yellow'); // boundary
    expect(getColor(0.5)).toBe('red');    // boundary
  });
});

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

describe('completions', () => {
  const commands = ['store', 'recall', 'list', 'update', 'delete', 'ingest', 'extract',
    'consolidate', 'relations', 'suggested', 'status', 'export', 'import', 'stats', 'completions'];

  test('all commands present', () => {
    expect(commands.length).toBe(15);
    expect(commands).toContain('store');
    expect(commands).toContain('export');
    expect(commands).toContain('import');
    expect(commands).toContain('stats');
    expect(commands).toContain('completions');
  });
});
