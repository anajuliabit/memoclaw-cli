/**
 * Integration tests for command handlers with mocked HTTP layer.
 * Covers: store, recall, list, search, get, delete, update, count,
 *         history, relations, consolidate, context, extract, ingest,
 *         suggested, namespace, graph, export, purge, validate.
 *
 * MEM-159: Expand CLI test coverage beyond parseArgs
 *
 * Strategy: We test command handler logic by mocking global fetch and
 * setting MEMOCLAW_PRIVATE_KEY env before importing modules.
 */

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';

// Env vars are set in test/setup.ts via bunfig.toml preload

// Prevent readStdin from blocking (it checks isTTY)
(process.stdin as any).isTTY = true;

// ─── Mock fetch globally ─────────────────────────────────────────────────────

let mockFetchResponse: any = {};
let lastFetchUrl = '';
let lastFetchOptions: any = {};
const allFetches: { url: string; options: any }[] = [];

const originalFetch = globalThis.fetch;

function setupMockFetch() {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    lastFetchUrl = url;
    lastFetchOptions = init || {};
    allFetches.push({ url, options: init || {} });

    let responseData: any;
    if (typeof mockFetchResponse === 'function') {
      responseData = mockFetchResponse(url, init);
    } else {
      responseData = mockFetchResponse;
    }

    return {
      ok: true,
      status: 200,
      json: async () => responseData,
      headers: new Headers({ 'content-type': 'application/json' }),
      clone: () => ({
        json: async () => responseData,
        text: async () => JSON.stringify(responseData),
      }),
    } as Response;
  }) as any;
}

afterAll(() => {
  globalThis.fetch = originalFetch;
  restoreConsole();
});

// ─── Capture console output ─────────────────────────────────────────────────

let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
const origLog = console.log;
const origError = console.error;

function captureConsole() {
  consoleOutput = [];
  consoleErrors = [];
  console.log = (...args: any[]) => consoleOutput.push(args.map(String).join(' '));
  console.error = (...args: any[]) => consoleErrors.push(args.map(String).join(' '));
}

function restoreConsole() {
  console.log = origLog;
  console.error = origError;
}

// ─── Reset output module state ───────────────────────────────────────────────

const outputMod = await import('../src/output.js');

function resetOutputState(overrides: Record<string, any> = {}) {
  // configureOutput mutates module-level vars
  outputMod.configureOutput({
    json: overrides.json ?? false,
    quiet: overrides.quiet ?? false,
    pretty: overrides.pretty ?? false,
    format: overrides.format,
    truncate: overrides.truncate,
    noTruncate: false,
    field: null,
    output: null,
  });
}

// ─── Import commands ─────────────────────────────────────────────────────────

const { cmdStore, cmdStoreBatch } = await import('../src/commands/store.js');
const { cmdRecall } = await import('../src/commands/recall.js');
const { cmdList } = await import('../src/commands/list.js');
const { cmdGet, cmdDelete, cmdUpdate } = await import('../src/commands/memory.js');
const { cmdSearch, cmdContext, cmdExtract, cmdIngest, cmdConsolidate } = await import('../src/commands/search.js');
const { cmdCount, cmdSuggested, cmdGraph } = await import('../src/commands/status.js');
const { cmdHistory } = await import('../src/commands/history.js');
const { cmdRelations } = await import('../src/commands/relations.js');
const { cmdNamespace } = await import('../src/commands/namespace.js');
const { cmdExport, cmdPurge } = await import('../src/commands/data.js');
const { validateContentLength, validateImportance } = await import('../src/validate.js');

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetchResponse = {};
  lastFetchUrl = '';
  lastFetchOptions = {};
  allFetches.length = 0;
  resetOutputState();
  captureConsole();
  setupMockFetch();
});

// Helper to get body from last fetch
function getLastBody(): any {
  if (lastFetchOptions.body) return JSON.parse(lastFetchOptions.body);
  return null;
}

// ─── Store ───────────────────────────────────────────────────────────────────

describe('cmdStore', () => {
  test('sends POST /v1/store with content', async () => {
    mockFetchResponse = { id: 'abc-123', importance: 0.5 };
    await cmdStore('hello world', { _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/store');
    expect(lastFetchOptions.method).toBe('POST');
    expect(getLastBody().content).toBe('hello world');
    restoreConsole();
  });

  test('includes importance, tags, namespace in body', async () => {
    mockFetchResponse = { id: 'abc-123' };
    await cmdStore('test', { _: [], importance: '0.8', tags: 'a,b', namespace: 'proj1' } as any);
    const body = getLastBody();
    expect(body.importance).toBe(0.8);
    expect(body.metadata).toEqual({ tags: ['a', 'b'] });
    expect(body.namespace).toBe('proj1');
    restoreConsole();
  });

  test('includes immutable and pinned flags', async () => {
    mockFetchResponse = { id: 'abc-123' };
    await cmdStore('test', { _: [], immutable: true, pinned: true } as any);
    const body = getLastBody();
    expect(body.immutable).toBe(true);
    expect(body.pinned).toBe(true);
    restoreConsole();
  });

  test('outputs JSON when json mode', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { id: 'abc-123', importance: 0.5 };
    await cmdStore('hello', { _: [] } as any);
    const output = consoleOutput.join('\n');
    expect(output).toContain('abc-123');
    restoreConsole();
  });

  test('outputs success message in text mode', async () => {
    mockFetchResponse = { id: 'abc-123', importance: 0.7 };
    await cmdStore('hello', { _: [] } as any);
    const output = consoleOutput.join('\n');
    expect(output).toContain('Memory stored');
    expect(output).toContain('abc-123');
    restoreConsole();
  });

  test('rejects content over 8192 chars', async () => {
    await expect(cmdStore('x'.repeat(8193), { _: [] } as any)).rejects.toThrow('8192');
    restoreConsole();
  });

  test('rejects invalid importance', async () => {
    await expect(cmdStore('test', { _: [], importance: '1.5' } as any)).rejects.toThrow('between 0 and 1');
    restoreConsole();
  });

  test('trims tags', async () => {
    mockFetchResponse = { id: 'abc-123' };
    await cmdStore('test', { _: [], tags: ' a , b , c ' } as any);
    expect(getLastBody().metadata.tags).toEqual(['a', 'b', 'c']);
    restoreConsole();
  });

  test('does not include undefined optional fields', async () => {
    mockFetchResponse = { id: 'abc-123' };
    await cmdStore('test', { _: [] } as any);
    const body = getLastBody();
    expect(body.importance).toBeUndefined();
    expect(body.metadata).toBeUndefined();
    expect(body.namespace).toBeUndefined();
    restoreConsole();
  });

  test('passes session-id, agent-id, and expires-at', async () => {
    mockFetchResponse = { id: 'abc-123' };
    await cmdStore('test', { _: [], sessionId: 'sess-1', agentId: 'agent-1', expiresAt: '2026-12-31T00:00:00Z' } as any);
    const body = getLastBody();
    expect(body.session_id).toBe('sess-1');
    expect(body.agent_id).toBe('agent-1');
    expect(body.expires_at).toBe('2026-12-31T00:00:00Z');
    restoreConsole();
  });
});

// ─── Store Batch ─────────────────────────────────────────────────────────────

describe('cmdStoreBatch', () => {
  test('stores line-per-memory from stdin', async () => {
    mockFetchResponse = { stored: 2 };
    await cmdStoreBatch({ _: [] } as any, ['memory one', 'memory two']);
    const body = JSON.parse(lastFetchOptions.body);
    expect(body.memories).toHaveLength(2);
    expect(body.memories[0].content).toBe('memory one');
    expect(body.memories[1].content).toBe('memory two');
  });

  test('stores from JSON array of strings', async () => {
    mockFetchResponse = { stored: 2 };
    await cmdStoreBatch({ _: [] } as any, ['["first","second"]']);
    const body = JSON.parse(lastFetchOptions.body);
    expect(body.memories).toHaveLength(2);
    expect(body.memories[0].content).toBe('first');
  });

  test('stores from JSON array of objects', async () => {
    mockFetchResponse = { stored: 1 };
    await cmdStoreBatch({ _: [] } as any, ['[{"content":"hello","importance":0.9}]']);
    const body = JSON.parse(lastFetchOptions.body);
    expect(body.memories[0].content).toBe('hello');
    expect(body.memories[0].importance).toBe(0.9);
  });

  test('applies shared opts to each memory', async () => {
    mockFetchResponse = { stored: 2 };
    await cmdStoreBatch({ _: [], namespace: 'test-ns', tags: 'a,b', immutable: true } as any, ['one', 'two']);
    const body = JSON.parse(lastFetchOptions.body);
    expect(body.memories[0].namespace).toBe('test-ns');
    expect(body.memories[0].metadata.tags).toEqual(['a', 'b']);
    expect(body.memories[0].immutable).toBe(true);
  });

  test('skips empty lines', async () => {
    mockFetchResponse = { stored: 1 };
    await cmdStoreBatch({ _: [] } as any, ['hello', '', '  ', 'world']);
    const body = JSON.parse(lastFetchOptions.body);
    expect(body.memories).toHaveLength(2);
  });

  test('throws on empty input', async () => {
    await expect(cmdStoreBatch({ _: [] } as any, [])).rejects.toThrow('No input');
  });
});

// ─── Recall ──────────────────────────────────────────────────────────────────

describe('cmdRecall', () => {
  test('sends POST /v1/recall with query', async () => {
    mockFetchResponse = { memories: [] };
    await cmdRecall('test query', { _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/recall');
    expect(getLastBody().query).toBe('test query');
    restoreConsole();
  });

  test('includes limit and minSimilarity', async () => {
    mockFetchResponse = { memories: [] };
    await cmdRecall('q', { _: [], limit: '5', minSimilarity: '0.7' } as any);
    const body = getLastBody();
    expect(body.limit).toBe(5);
    expect(body.min_similarity).toBe(0.7);
    restoreConsole();
  });

  test('includes namespace and tag filters', async () => {
    mockFetchResponse = { memories: [] };
    await cmdRecall('q', { _: [], namespace: 'proj', tags: 'a,b' } as any);
    const body = getLastBody();
    expect(body.namespace).toBe('proj');
    expect(body.filters).toEqual({ tags: ['a', 'b'] });
    restoreConsole();
  });

  test('formats results with similarity scores', async () => {
    mockFetchResponse = {
      memories: [
        { content: 'hello world', similarity: 0.95, id: 'id1' },
        { content: 'foo bar', similarity: 0.6, id: 'id2', metadata: { tags: ['tag1'] } },
      ]
    };
    await cmdRecall('test', { _: [] } as any);
    const output = consoleOutput.join('\n');
    expect(output).toContain('0.950');
    expect(output).toContain('hello world');
    expect(output).toContain('tag1');
    restoreConsole();
  });

  test('outputs raw content with --raw', async () => {
    mockFetchResponse = { memories: [{ content: 'line1' }, { content: 'line2' }] };
    await cmdRecall('q', { _: [], raw: true } as any);
    expect(consoleOutput).toEqual(['line1', 'line2']);
    restoreConsole();
  });

  test('shows "No memories found" for empty results', async () => {
    mockFetchResponse = { memories: [] };
    await cmdRecall('q', { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('No memories found');
    restoreConsole();
  });

  test('JSON mode outputs raw response', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { memories: [{ content: 'hi', similarity: 0.9 }] };
    await cmdRecall('q', { _: [] } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories[0].content).toBe('hi');
    restoreConsole();
  });

  test('shows memory IDs in text mode', async () => {
    mockFetchResponse = { memories: [{ content: 'test', similarity: 0.8, id: 'mem-123' }] };
    await cmdRecall('q', { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('mem-123');
    restoreConsole();
  });
});

// ─── List ────────────────────────────────────────────────────────────────────

describe('cmdList', () => {
  test('sends GET /v1/memories', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdList({ _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/memories');
    expect(lastFetchOptions.method).toBe('GET');
    restoreConsole();
  });

  test('passes limit and offset as query params', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdList({ _: [], limit: '10', offset: '20' } as any);
    expect(lastFetchUrl).toContain('limit=10');
    expect(lastFetchUrl).toContain('offset=20');
    restoreConsole();
  });

  test('shows "No memories found" for empty list', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdList({ _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('No memories found');
    restoreConsole();
  });

  test('renders table with memories', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'abc12345-long-id', content: 'hello', importance: 0.7, metadata: { tags: ['t1'] }, created_at: '2025-01-01T00:00:00Z' }
      ],
      total: 1
    };
    await cmdList({ _: [] } as any);
    const output = consoleOutput.join('\n');
    expect(output).toContain('abc12345');
    expect(output).toContain('hello');
    restoreConsole();
  });

  test('JSON mode outputs raw response', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { memories: [{ id: 'x', content: 'y' }], total: 1 };
    await cmdList({ _: [] } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories[0].id).toBe('x');
    restoreConsole();
  });

  test('client-side sorting by importance', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', content: 'low', importance: 0.2, metadata: {} },
        { id: 'b', content: 'high', importance: 0.9, metadata: {} },
      ],
      total: 2
    };
    await cmdList({ _: [], sortBy: 'importance' } as any);
    const output = consoleOutput.join('\n');
    const lowIdx = output.indexOf('0.20');
    const highIdx = output.indexOf('0.90');
    expect(lowIdx).toBeLessThan(highIdx);
    restoreConsole();
  });

  test('reverse sorting', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', content: 'low', importance: 0.2, metadata: {} },
        { id: 'b', content: 'high', importance: 0.9, metadata: {} },
      ],
      total: 2
    };
    await cmdList({ _: [], sortBy: 'importance', reverse: true } as any);
    const output = consoleOutput.join('\n');
    const lowIdx = output.indexOf('0.20');
    const highIdx = output.indexOf('0.90');
    expect(highIdx).toBeLessThan(lowIdx);
    restoreConsole();
  });

  test('passes tags query param', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdList({ _: [], tags: 'foo,bar' } as any);
    expect(lastFetchUrl).toContain('tags=foo');
    restoreConsole();
  });

  test('passes memory_type query param', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdList({ _: [], memoryType: 'core' } as any);
    expect(lastFetchUrl).toContain('memory_type=core');
    restoreConsole();
  });

  test('passes agent_id and session_id query params', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdList({ _: [], agentId: 'agent-1', sessionId: 'sess-1' } as any);
    expect(lastFetchUrl).toContain('agent_id=agent-1');
    expect(lastFetchUrl).toContain('session_id=sess-1');
    restoreConsole();
  });
});

// ─── Search ──────────────────────────────────────────────────────────────────

describe('cmdSearch', () => {
  test('sends GET /v1/memories/search with query', async () => {
    mockFetchResponse = { memories: [] };
    await cmdSearch('hello', { _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/memories/search');
    expect(lastFetchUrl).toContain('q=hello');
    restoreConsole();
  });

  test('includes limit, namespace, tags', async () => {
    mockFetchResponse = { memories: [] };
    await cmdSearch('q', { _: [], limit: '5', namespace: 'ns', tags: 'a' } as any);
    expect(lastFetchUrl).toContain('limit=5');
    expect(lastFetchUrl).toContain('namespace=ns');
    expect(lastFetchUrl).toContain('tags=a');
    restoreConsole();
  });

  test('raw mode outputs content only', async () => {
    mockFetchResponse = { memories: [{ content: 'result1', id: 'x' }] };
    await cmdSearch('q', { _: [], raw: true } as any);
    expect(consoleOutput).toEqual(['result1']);
    restoreConsole();
  });

  test('shows free text search footer', async () => {
    mockFetchResponse = { memories: [{ content: 'x', id: 'id1' }] };
    await cmdSearch('q', { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('text search, free');
    restoreConsole();
  });

  test('shows "No memories found" when empty', async () => {
    mockFetchResponse = { memories: [] };
    await cmdSearch('q', { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('No memories found');
    restoreConsole();
  });
});

// ─── Get ─────────────────────────────────────────────────────────────────────

describe('cmdGet', () => {
  test('sends GET /v1/memories/:id', async () => {
    mockFetchResponse = { id: 'abc-123', content: 'hello' };
    await cmdGet('abc-123');
    expect(lastFetchUrl).toContain('/v1/memories/abc-123');
    restoreConsole();
  });

  test('displays all memory fields', async () => {
    mockFetchResponse = {
      id: 'abc-123', content: 'hello world', importance: 0.8,
      namespace: 'proj', metadata: { tags: ['a', 'b'] },
      memory_type: 'episodic', created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z', immutable: true, pinned: true
    };
    await cmdGet('abc-123');
    const output = consoleOutput.join('\n');
    expect(output).toContain('hello world');
    expect(output).toContain('0.8');
    expect(output).toContain('proj');
    expect(output).toContain('a, b');
    expect(output).toContain('episodic');
    expect(output).toContain('Immutable');
    expect(output).toContain('Pinned');
    restoreConsole();
  });

  test('displays expires_at, session_id, agent_id', async () => {
    mockFetchResponse = {
      id: 'abc-123', content: 'hello',
      expires_at: '2026-12-31T00:00:00Z',
      session_id: 'sess-42',
      agent_id: 'agent-7',
    };
    await cmdGet('abc-123');
    const output = consoleOutput.join('\n');
    expect(output).toContain('Expires');
    expect(output).toContain('sess-42');
    expect(output).toContain('agent-7');
    restoreConsole();
  });

  test('handles nested memory object', async () => {
    mockFetchResponse = { memory: { id: 'x', content: 'nested' } };
    await cmdGet('x');
    expect(consoleOutput.join('\n')).toContain('nested');
    restoreConsole();
  });

  test('JSON mode outputs raw', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { id: 'x', content: 'test' };
    await cmdGet('x');
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.content).toBe('test');
    restoreConsole();
  });
});

// ─── Delete ──────────────────────────────────────────────────────────────────

describe('cmdDelete', () => {
  test('sends DELETE /v1/memories/:id', async () => {
    mockFetchResponse = { deleted: true };
    await cmdDelete('abc-123');
    expect(lastFetchUrl).toContain('/v1/memories/abc-123');
    expect(lastFetchOptions.method).toBe('DELETE');
    restoreConsole();
  });

  test('shows success with truncated ID', async () => {
    mockFetchResponse = { deleted: true };
    await cmdDelete('abc-12345-long-id');
    const output = consoleOutput.join('\n');
    expect(output).toContain('deleted');
    expect(output).toContain('abc-1234');
    restoreConsole();
  });
});

// ─── Update ──────────────────────────────────────────────────────────────────

describe('cmdUpdate', () => {
  test('sends PATCH with fields', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], content: 'new', importance: '0.9', tags: 'x,y' } as any);
    expect(lastFetchOptions.method).toBe('PATCH');
    expect(lastFetchUrl).toContain('/v1/memories/abc');
    const body = getLastBody();
    expect(body.content).toBe('new');
    expect(body.importance).toBe(0.9);
    expect(body.metadata).toEqual({ tags: ['x', 'y'] });
    restoreConsole();
  });

  test('throws if no fields provided', async () => {
    await expect(cmdUpdate('abc', { _: [] } as any)).rejects.toThrow('No fields to update');
    restoreConsole();
  });

  test('validates content length', async () => {
    await expect(cmdUpdate('abc', { _: [], content: 'x'.repeat(8193) } as any)).rejects.toThrow('8192');
    restoreConsole();
  });

  test('validates importance range', async () => {
    await expect(cmdUpdate('abc', { _: [], importance: '2.0' } as any)).rejects.toThrow('between 0 and 1');
    restoreConsole();
  });

  test('handles pinned as string "true"', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], pinned: 'true' } as any);
    expect(getLastBody().pinned).toBe(true);
    restoreConsole();
  });

  test('handles namespace and memoryType', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], namespace: 'ns', memoryType: 'episodic' } as any);
    const body = getLastBody();
    expect(body.namespace).toBe('ns');
    expect(body.memory_type).toBe('episodic');
    restoreConsole();
  });
});

// ─── Count ───────────────────────────────────────────────────────────────────

describe('cmdCount', () => {
  test('outputs total count as plain number', async () => {
    mockFetchResponse = { total: 42, memories: [] };
    await cmdCount({ _: [] } as any);
    expect(consoleOutput).toEqual(['42']);
    restoreConsole();
  });

  test('passes namespace param', async () => {
    mockFetchResponse = { total: 10, memories: [] };
    await cmdCount({ _: [], namespace: 'proj' } as any);
    expect(lastFetchUrl).toContain('namespace=proj');
    restoreConsole();
  });

  test('JSON mode outputs object with count and namespace', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { total: 42, memories: [] };
    await cmdCount({ _: [], namespace: 'proj' } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.count).toBe(42);
    expect(parsed.namespace).toBe('proj');
    restoreConsole();
  });

  test('JSON mode with null namespace', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { total: 5, memories: [] };
    await cmdCount({ _: [] } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.namespace).toBeNull();
    restoreConsole();
  });
});

// ─── History ─────────────────────────────────────────────────────────────────

describe('cmdHistory', () => {
  test('sends GET /v1/memories/:id/history', async () => {
    mockFetchResponse = { history: [] };
    await cmdHistory('abc-123');
    expect(lastFetchUrl).toContain('/v1/memories/abc-123/history');
    restoreConsole();
  });

  test('shows "No history entries" when empty', async () => {
    mockFetchResponse = { history: [] };
    await cmdHistory('abc-123');
    expect(consoleOutput.join('\n')).toContain('No history');
    restoreConsole();
  });

  test('renders history table', async () => {
    mockFetchResponse = {
      history: [
        { id: 'h1-longhash-value', created_at: '2025-01-01T00:00:00Z', changes: { content: true, importance: true } }
      ]
    };
    await cmdHistory('abc-123');
    const output = consoleOutput.join('\n');
    expect(output).toContain('h1-longh');
    expect(output).toContain('content, importance');
    restoreConsole();
  });

  test('JSON mode outputs raw', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { history: [{ id: 'h1', changes: {} }] };
    await cmdHistory('abc');
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.history).toBeDefined();
    restoreConsole();
  });
});

// ─── Relations ───────────────────────────────────────────────────────────────

describe('cmdRelations', () => {
  test('list sends GET /v1/memories/:id/relations', async () => {
    mockFetchResponse = { relations: [] };
    await cmdRelations('list', ['mem-id'], { _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/memories/mem-id/relations');
    restoreConsole();
  });

  test('list shows "No relations" when empty', async () => {
    mockFetchResponse = { relations: [] };
    await cmdRelations('list', ['mem-id'], { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('No relations');
    restoreConsole();
  });

  test('list renders table with relations', async () => {
    mockFetchResponse = { relations: [
      { id: 'rel-12345678', relation_type: 'supports', target_id: 'tgt-12345678' }
    ]};
    await cmdRelations('list', ['mem-id'], { _: [] } as any);
    const output = consoleOutput.join('\n');
    expect(output).toContain('supports');
    expect(output).toContain('tgt-1234');
    restoreConsole();
  });

  test('create sends POST with body', async () => {
    mockFetchResponse = { id: 'rel-1' };
    await cmdRelations('create', ['mem1', 'mem2', 'related_to'], { _: [] } as any);
    expect(lastFetchOptions.method).toBe('POST');
    expect(lastFetchUrl).toContain('/v1/memories/mem1/relations');
    const body = getLastBody();
    expect(body).toEqual({ target_id: 'mem2', relation_type: 'related_to' });
    restoreConsole();
  });

  test('create rejects invalid relation type', async () => {
    await expect(
      cmdRelations('create', ['m1', 'm2', 'invalid'], { _: [] } as any)
    ).rejects.toThrow('Invalid relation type');
    restoreConsole();
  });

  test('create accepts all valid types', async () => {
    for (const type of ['related_to', 'derived_from', 'contradicts', 'supersedes', 'supports']) {
      mockFetchResponse = { id: 'rel-1' };
      await cmdRelations('create', ['m1', 'm2', type], { _: [] } as any);
      expect(getLastBody().relation_type).toBe(type);
    }
    restoreConsole();
  });

  test('delete sends DELETE', async () => {
    mockFetchResponse = { deleted: true };
    await cmdRelations('delete', ['mem-id', 'rel-id'], { _: [] } as any);
    expect(lastFetchOptions.method).toBe('DELETE');
    expect(lastFetchUrl).toContain('/v1/memories/mem-id/relations/rel-id');
    restoreConsole();
  });

  test('throws on invalid subcommand', async () => {
    await expect(cmdRelations('bad', [], { _: [] } as any)).rejects.toThrow('Usage');
    restoreConsole();
  });

  test('list throws if no memory ID', async () => {
    await expect(cmdRelations('list', [], { _: [] } as any)).rejects.toThrow('Memory ID required');
    restoreConsole();
  });

  test('create throws if missing args', async () => {
    await expect(cmdRelations('create', ['m1'], { _: [] } as any)).rejects.toThrow('Usage');
    restoreConsole();
  });

  test('delete throws if missing args', async () => {
    await expect(cmdRelations('delete', ['m1'], { _: [] } as any)).rejects.toThrow('Usage');
    restoreConsole();
  });
});

// ─── Context ─────────────────────────────────────────────────────────────────

describe('cmdContext', () => {
  test('sends POST /v1/context', async () => {
    mockFetchResponse = { context: 'summary' };
    await cmdContext('what do I know?', { _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/context');
    expect(getLastBody().query).toBe('what do I know?');
    restoreConsole();
  });

  test('displays context text', async () => {
    mockFetchResponse = { context: 'You know about X and Y' };
    await cmdContext('q', { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('You know about X and Y');
    restoreConsole();
  });

  test('passes namespace and limit', async () => {
    mockFetchResponse = { context: 'text' };
    await cmdContext('q', { _: [], namespace: 'proj', limit: '5' } as any);
    const body = getLastBody();
    expect(body.namespace).toBe('proj');
    expect(body.limit).toBe(5);
    restoreConsole();
  });

  test('handles text field in response', async () => {
    mockFetchResponse = { text: 'alt text field' };
    await cmdContext('q', { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('alt text field');
    restoreConsole();
  });
});

// ─── Extract ─────────────────────────────────────────────────────────────────

describe('cmdExtract', () => {
  test('sends POST /v1/memories/extract', async () => {
    mockFetchResponse = { memories: [] };
    await cmdExtract('some text', { _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/memories/extract');
    expect(getLastBody().text).toBe('some text');
    restoreConsole();
  });

  test('passes optional fields', async () => {
    mockFetchResponse = { memories: [] };
    await cmdExtract('text', { _: [], namespace: 'ns', sessionId: 'sess', agentId: 'agent' } as any);
    const body = getLastBody();
    expect(body.namespace).toBe('ns');
    expect(body.session_id).toBe('sess');
    expect(body.agent_id).toBe('agent');
    restoreConsole();
  });

  test('rejects empty text', async () => {
    await expect(cmdExtract('', { _: [] } as any)).rejects.toThrow('empty');
    restoreConsole();
  });

  test('rejects whitespace-only text', async () => {
    await expect(cmdExtract('   \n\t  ', { _: [] } as any)).rejects.toThrow('empty');
    restoreConsole();
  });
});

// ─── Ingest ──────────────────────────────────────────────────────────────────

describe('cmdIngest', () => {
  test('sends POST /v1/ingest with text', async () => {
    mockFetchResponse = { memories_created: 3 };
    await cmdIngest({ _: [], text: 'meeting notes' } as any);
    expect(lastFetchUrl).toContain('/v1/ingest');
    expect(getLastBody().text).toBe('meeting notes');
    restoreConsole();
  });

  test('shows success with count', async () => {
    mockFetchResponse = { memories_created: 5 };
    await cmdIngest({ _: [], text: 'notes' } as any);
    expect(consoleOutput.join('\n')).toContain('5 memories created');
    restoreConsole();
  });

  test('throws without text and no stdin', async () => {
    await expect(cmdIngest({ _: [] } as any)).rejects.toThrow('Text required');
    restoreConsole();
  });

  test('rejects whitespace-only text', async () => {
    await expect(cmdIngest({ _: [], text: '   \n  ' } as any)).rejects.toThrow('empty');
    restoreConsole();
  });

  test('auto_relate defaults to true', async () => {
    mockFetchResponse = { memories_created: 1 };
    await cmdIngest({ _: [], text: 'test' } as any);
    expect(getLastBody().auto_relate).toBe(true);
    restoreConsole();
  });

  test('JSON mode outputs raw', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { memories_created: 2 };
    await cmdIngest({ _: [], text: 'test' } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories_created).toBe(2);
    restoreConsole();
  });
});

// ─── Consolidate ─────────────────────────────────────────────────────────────

describe('cmdConsolidate', () => {
  test('sends POST /v1/memories/consolidate', async () => {
    mockFetchResponse = { merged_count: 2 };
    await cmdConsolidate({ _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/memories/consolidate');
    restoreConsole();
  });

  test('passes options correctly', async () => {
    mockFetchResponse = { merged_count: 0 };
    await cmdConsolidate({ _: [], namespace: 'ns', minSimilarity: '0.9', mode: 'aggressive', dryRun: true } as any);
    const body = getLastBody();
    expect(body.namespace).toBe('ns');
    expect(body.min_similarity).toBe(0.9);
    expect(body.mode).toBe('aggressive');
    expect(body.dry_run).toBe(true);
    restoreConsole();
  });

  test('shows dry run info', async () => {
    mockFetchResponse = { merged_count: 3, clusters: [1, 2, 3] };
    await cmdConsolidate({ _: [], dryRun: true } as any);
    const all = consoleOutput.join('\n') + consoleErrors.join('\n');
    expect(all).toContain('Dry run');
    restoreConsole();
  });

  test('shows merged count', async () => {
    mockFetchResponse = { merged_count: 5 };
    await cmdConsolidate({ _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('5 memories merged');
    restoreConsole();
  });
});

// ─── Suggested ───────────────────────────────────────────────────────────────

describe('cmdSuggested', () => {
  test('sends GET /v1/suggested', async () => {
    mockFetchResponse = { suggested: [] };
    await cmdSuggested({ _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/suggested');
    restoreConsole();
  });

  test('shows "No suggested" when empty', async () => {
    mockFetchResponse = { suggested: [] };
    await cmdSuggested({ _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('No suggested');
    restoreConsole();
  });

  test('passes category filter', async () => {
    mockFetchResponse = { suggested: [] };
    await cmdSuggested({ _: [], category: 'stale' } as any);
    expect(lastFetchUrl).toContain('category=stale');
    restoreConsole();
  });

  test('renders suggestions with categories', async () => {
    mockFetchResponse = {
      categories: { stale: 3, fresh: 5 },
      suggested: [
        { content: 'old memory', category: 'STALE', review_score: 0.85, metadata: { tags: ['t1'] } }
      ]
    };
    await cmdSuggested({ _: [] } as any);
    const output = consoleOutput.join('\n');
    expect(output).toContain('STALE');
    expect(output).toContain('old memory');
    restoreConsole();
  });
});

// ─── Graph ───────────────────────────────────────────────────────────────────

describe('cmdGraph', () => {
  test('fetches memory and relations', async () => {
    mockFetchResponse = (url: string) => {
      if (url.includes('/relations')) return { relations: [] };
      return { id: 'abc-12345678', content: 'test memory' };
    };
    await cmdGraph('abc-12345678', { _: [] } as any);
    expect(allFetches.length).toBe(2);
    restoreConsole();
  });

  test('renders tree with relations', async () => {
    mockFetchResponse = (url: string) => {
      if (url.includes('/relations')) return {
        relations: [{ id: 'rel-1', relation_type: 'related_to', target_id: 'target-12345678' }]
      };
      return { id: 'abc-12345678', content: 'root memory' };
    };
    await cmdGraph('abc-12345678', { _: [] } as any);
    const output = consoleOutput.join('\n');
    expect(output).toContain('abc-1234');
    expect(output).toContain('related_to');
    expect(output).toContain('target-1');
    restoreConsole();
  });

  test('shows no relations message', async () => {
    mockFetchResponse = (url: string) => {
      if (url.includes('/relations')) return { relations: [] };
      return { id: 'abc-12345678', content: 'lonely memory' };
    };
    await cmdGraph('abc-12345678', { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('no relations');
    restoreConsole();
  });

  test('JSON mode outputs object', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = (url: string) => {
      if (url.includes('/relations')) return { relations: [] };
      return { id: 'x', content: 'test' };
    };
    await cmdGraph('x', { _: [] } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memory).toBeDefined();
    expect(parsed.relations).toBeDefined();
    restoreConsole();
  });
});

// ─── Namespace ───────────────────────────────────────────────────────────────

describe('cmdNamespace', () => {
  test('list fetches namespaces', async () => {
    mockFetchResponse = { namespaces: ['ns1', 'ns2'] };
    await cmdNamespace('list', [], { _: [] } as any);
    expect(lastFetchUrl).toContain('/v1/namespaces');
    restoreConsole();
  });

  test('shows "No namespaces" when empty', async () => {
    mockFetchResponse = { namespaces: [] };
    await cmdNamespace('list', [], { _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('No namespaces');
    restoreConsole();
  });

  test('default subcommand is list', async () => {
    mockFetchResponse = { namespaces: ['ns1'] };
    await cmdNamespace('', [], { _: [] } as any);
    // Should not throw — defaults to list
    restoreConsole();
  });

  test('throws on invalid subcommand', async () => {
    await expect(cmdNamespace('bad', [], { _: [] } as any)).rejects.toThrow('Usage');
    restoreConsole();
  });

  test('JSON mode for list', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = { namespaces: ['ns1', 'ns2'] };
    await cmdNamespace('list', [], { _: [] } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.namespaces).toEqual(['ns1', 'ns2']);
    expect(parsed.count).toBe(2);
    restoreConsole();
  });
});

// ─── Export ──────────────────────────────────────────────────────────────────

describe('cmdExport', () => {
  test('fetches all memories and outputs JSON', async () => {
    mockFetchResponse = { memories: [{ id: 'a', content: 'hello' }], total: 1 };
    await cmdExport({ _: [] } as any);
    const output = consoleOutput.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.memories[0].id).toBe('a');
    expect(parsed.exported_at).toBeDefined();
    restoreConsole();
  });

  test('paginates through all pages', async () => {
    let callCount = 0;
    mockFetchResponse = () => {
      callCount++;
      if (callCount === 1) {
        // Return full page (limit=1000 by default)
        return { memories: Array(1000).fill({ id: 'x', content: 'mem' }), total: 1500 };
      }
      // Second page: less than limit → stops
      return { memories: Array(500).fill({ id: 'y', content: 'mem2' }), total: 1500 };
    };
    await cmdExport({ _: [] } as any);
    const output = consoleOutput.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.count).toBe(1500);
    expect(callCount).toBe(2);
    restoreConsole();
  });

  test('passes namespace filter', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdExport({ _: [], namespace: 'proj1' } as any);
    expect(lastFetchUrl).toContain('namespace=proj1');
    restoreConsole();
  });

  test('passes custom limit', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdExport({ _: [], limit: '50' } as any);
    expect(lastFetchUrl).toContain('limit=50');
    restoreConsole();
  });
});

// ─── Purge ───────────────────────────────────────────────────────────────────

describe('cmdPurge', () => {
  test('deletes all memories with --force', async () => {
    let callCount = 0;
    mockFetchResponse = (url: string, init: any) => {
      if (init?.method === 'POST' && url.includes('bulk-delete')) {
        return { deleted: 2 };
      }
      callCount++;
      if (callCount === 1) return { memories: [{ id: 'a' }, { id: 'b' }], total: 2 };
      return { memories: [], total: 0 };
    };
    await cmdPurge({ _: [], force: true } as any);
    // Should have called bulk-delete
    const bulkCall = allFetches.find(f => f.url.includes('bulk-delete'));
    expect(bulkCall).toBeDefined();
    restoreConsole();
  });

  test('passes namespace to list query', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    await cmdPurge({ _: [], force: true, namespace: 'old' } as any);
    expect(lastFetchUrl).toContain('namespace=old');
    restoreConsole();
  });

  test('throws without --force in non-TTY', async () => {
    const origIsTTY = (process.stdin as any).isTTY;
    (process.stdin as any).isTTY = false;
    await expect(cmdPurge({ _: [] } as any)).rejects.toThrow('--force');
    (process.stdin as any).isTTY = origIsTTY;
    restoreConsole();
  });

  test('JSON mode outputs deleted count', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = (url: string, init: any) => {
      if (init?.method === 'POST') return { deleted: 3 };
      return { memories: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], total: 3 };
    };
    // Need two calls: first returns memories, second returns empty
    let listCallCount = 0;
    mockFetchResponse = (url: string, init: any) => {
      if (init?.method === 'POST') return { deleted: 3 };
      listCallCount++;
      if (listCallCount === 1) return { memories: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], total: 3 };
      return { memories: [], total: 0 };
    };
    await cmdPurge({ _: [], force: true } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.deleted).toBe(3);
    restoreConsole();
  });

  test('--yes works as alias for --force', async () => {
    mockFetchResponse = (url: string, init: any) => {
      if (init?.method === 'POST') return { deleted: 1 };
      return { memories: [], total: 0 };
    };
    await cmdPurge({ _: [], yes: true } as any);
    // No throw means it accepted --yes
    restoreConsole();
  });
});

// ─── Validate module ─────────────────────────────────────────────────────────

describe('validateContentLength', () => {
  test('allows exactly 8192 chars', () => {
    expect(() => validateContentLength('x'.repeat(8192))).not.toThrow();
  });

  test('throws over 8192 chars', () => {
    expect(() => validateContentLength('x'.repeat(8193))).toThrow('8192');
  });

  test('includes actual length in error', () => {
    expect(() => validateContentLength('x'.repeat(9000))).toThrow('9000');
  });

  test('uses custom label', () => {
    expect(() => validateContentLength('x'.repeat(8193), 'Update')).toThrow('Update');
  });

  test('rejects empty content', () => {
    expect(() => validateContentLength('')).toThrow('empty');
  });

  test('rejects whitespace-only content', () => {
    expect(() => validateContentLength('   \n\t  ')).toThrow('empty');
  });
});

describe('store batch flags', () => {
  test('batch passes session-id, agent-id, expires-at to each memory', async () => {
    const { cmdStoreBatch } = await import('../src/commands/store.js');
    mockFetchResponse = { stored: 2 };
    allFetches.length = 0;

    await cmdStoreBatch(
      { _: [], sessionId: 'sess-1', agentId: 'agent-1', expiresAt: '2026-12-31', quiet: true, json: false } as any,
      ['memory one', 'memory two']
    );

    const body = JSON.parse(allFetches.find(f => f.url.includes('/store/batch'))?.options?.body || '{}');
    expect(body.memories[0].session_id).toBe('sess-1');
    expect(body.memories[0].agent_id).toBe('agent-1');
    expect(body.memories[0].expires_at).toBe('2026-12-31');
    expect(body.memories[1].session_id).toBe('sess-1');
  });
});

describe('list tags filter', () => {
  test('passes tags to query params', async () => {
    const { cmdList } = await import('../src/commands/list.js');
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;

    await cmdList({ _: [], tags: 'urgent,fix' } as any);

    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('tags=urgent%2Cfix');
  });
});

describe('validateImportance', () => {
  test('accepts 0', () => expect(validateImportance('0')).toBe(0));
  test('accepts 1', () => expect(validateImportance('1')).toBe(1));
  test('accepts 0.5', () => expect(validateImportance('0.5')).toBe(0.5));
  test('rejects -0.1', () => expect(() => validateImportance('-0.1')).toThrow());
  test('rejects 1.1', () => expect(() => validateImportance('1.1')).toThrow());
  test('rejects "abc"', () => expect(() => validateImportance('abc')).toThrow());
  test('rejects empty', () => expect(() => validateImportance('')).toThrow());
});
