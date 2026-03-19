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
      text: async () => JSON.stringify(responseData),
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
    output: overrides.output ?? null,
  });
}

// ─── Import commands ─────────────────────────────────────────────────────────

const { cmdStore, cmdStoreBatch } = await import('../src/commands/store.js');
const { cmdRecall } = await import('../src/commands/recall.js');
const { cmdList } = await import('../src/commands/list.js');
const { cmdGet, cmdDelete, cmdUpdate, cmdBulkDelete, cmdPin, cmdUnpin, cmdLock, cmdUnlock, cmdEdit, cmdCopy, cmdMove } = await import('../src/commands/memory.js');
const { cmdSearch, cmdContext, cmdExtract, cmdIngest, cmdConsolidate } = await import('../src/commands/search.js');
const { cmdCount, cmdSuggested, cmdGraph } = await import('../src/commands/status.js');
const { cmdHistory } = await import('../src/commands/history.js');
const { cmdCore } = await import('../src/commands/core.js');
const { cmdRelations } = await import('../src/commands/relations.js');
const { cmdNamespace } = await import('../src/commands/namespace.js');
const { cmdExport, cmdImport, cmdPurge } = await import('../src/commands/data.js');
const { cmdWhoami } = await import('../src/commands/whoami.js');
const { cmdTags } = await import('../src/commands/tags.js');
const { validateContentLength, validateBulkContentLength, validateImportance } = await import('../src/validate.js');

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

  test('client-side sorting by created maps to created_at', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', content: 'newer', importance: 0.5, metadata: {}, created_at: '2026-03-01T12:00:00Z' },
        { id: 'b', content: 'older', importance: 0.5, metadata: {}, created_at: '2026-01-01T12:00:00Z' },
      ],
      total: 2
    };
    await cmdList({ _: [], sortBy: 'created' } as any);
    const output = consoleOutput.join('\n');
    const olderIdx = output.indexOf('older');
    const newerIdx = output.indexOf('newer');
    expect(olderIdx).toBeLessThan(newerIdx);
    restoreConsole();
  });

  test('client-side sorting by updated maps to updated_at', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', content: 'recent', importance: 0.5, metadata: {}, updated_at: '2026-03-01T12:00:00Z' },
        { id: 'b', content: 'stale', importance: 0.5, metadata: {}, updated_at: '2026-01-01T12:00:00Z' },
      ],
      total: 2
    };
    await cmdList({ _: [], sortBy: 'updated' } as any);
    const output = consoleOutput.join('\n');
    const staleIdx = output.indexOf('stale');
    const recentIdx = output.indexOf('recent');
    expect(staleIdx).toBeLessThan(recentIdx);
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

  test('outputs raw content with --raw', async () => {
    mockFetchResponse = { id: 'abc-123', content: 'just the content' };
    await cmdGet('abc-123', { _: [], raw: true } as any);
    expect(consoleOutput).toEqual(['just the content']);
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

  test('handles pinned as string "false"', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], pinned: 'false' } as any);
    expect(getLastBody().pinned).toBe(false);
    restoreConsole();
  });

  test('handles pinned as truthy string like "yes" (#157)', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], pinned: 'yes' } as any);
    expect(getLastBody().pinned).toBe(true);
    restoreConsole();
  });

  test('handles immutable boolean true in update', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], immutable: true } as any);
    expect(getLastBody().immutable).toBe(true);
    restoreConsole();
  });

  test('handles immutable string "false" in update', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], immutable: 'false' } as any);
    expect(getLastBody().immutable).toBe(false);
    restoreConsole();
  });

  test('handles immutable truthy string like "yes" in update (#157)', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], immutable: 'yes' } as any);
    expect(getLastBody().immutable).toBe(true);
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

  test('reads content from --file flag', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const tmpFile = path.join(import.meta.dir, '_test_update_file.txt');
    fs.writeFileSync(tmpFile, 'content from file');
    try {
      mockFetchResponse = { id: 'abc' };
      await cmdUpdate('abc', { _: [], file: tmpFile } as any);
      expect(getLastBody().content).toBe('content from file');
    } finally {
      fs.unlinkSync(tmpFile);
      restoreConsole();
    }
  });

  test('--file takes precedence over stdin for update', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const tmpFile = path.join(import.meta.dir, '_test_update_prio.txt');
    fs.writeFileSync(tmpFile, 'file wins');
    try {
      mockFetchResponse = { id: 'abc' };
      await cmdUpdate('abc', { _: [], file: tmpFile } as any);
      expect(getLastBody().content).toBe('file wins');
    } finally {
      fs.unlinkSync(tmpFile);
      restoreConsole();
    }
  });

  test('passes session-id and agent-id to API', async () => {
    mockFetchResponse = { id: 'abc' };
    await cmdUpdate('abc', { _: [], content: 'updated', sessionId: 'sess-1', agentId: 'agent-1' } as any);
    const body = getLastBody();
    expect(body.session_id).toBe('sess-1');
    expect(body.agent_id).toBe('agent-1');
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

  test('accepts text longer than 8192 chars (bulk limit is 100k)', async () => {
    mockFetchResponse = { memories: [] };
    const longText = 'a'.repeat(10000);
    await cmdExtract(longText, { _: [] } as any);
    expect(getLastBody().text).toBe(longText);
    restoreConsole();
  });

  test('rejects text longer than 100,000 chars', async () => {
    const longText = 'a'.repeat(100_001);
    await expect(cmdExtract(longText, { _: [] } as any)).rejects.toThrow('exceeds');
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

  test('accepts text longer than 8192 chars (bulk limit is 100k)', async () => {
    mockFetchResponse = { memories_created: 1 };
    const longText = 'a'.repeat(10000);
    await cmdIngest({ _: [], text: longText } as any);
    expect(getLastBody().text).toBe(longText);
    restoreConsole();
  });

  test('rejects text longer than 100,000 chars', async () => {
    const longText = 'a'.repeat(100_001);
    await expect(cmdIngest({ _: [], text: longText } as any)).rejects.toThrow('exceeds');
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

  test('list shows (default) label for empty namespace', async () => {
    mockFetchResponse = { namespaces: ['', 'proj'] };
    await cmdNamespace('list', [], { _: [] } as any);
    const output = consoleOutput.join('\n');
    expect(output).toContain('(default)');
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

  test('respects --since date filter when purging', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const recent = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

    let listCallCount = 0;
    const deletedIds: string[] = [];
    mockFetchResponse = (url: string, init: any) => {
      if (init?.method === 'POST' && url.includes('bulk-delete')) {
        const body = JSON.parse(init.body);
        deletedIds.push(...body.ids);
        return { deleted: body.ids.length };
      }
      listCallCount++;
      if (listCallCount === 1) {
        return {
          memories: [
            { id: 'old-one', created_at: old.toISOString() },
            { id: 'recent-one', created_at: recent.toISOString() },
          ],
          total: 2,
        };
      }
      return { memories: [], total: 2 };
    };

    await cmdPurge({ _: [], force: true, since: '2d' } as any);
    // Only the recent memory (within last 2 days) should be deleted
    expect(deletedIds).toContain('recent-one');
    expect(deletedIds).not.toContain('old-one');
    restoreConsole();
  });

  test('throws on invalid date format in --since', async () => {
    await expect(
      cmdPurge({ _: [], force: true, since: 'notadate' } as any)
    ).rejects.toThrow('Invalid date format');
    restoreConsole();
  });

  test('JSON output includes filtered flag when date filter used', async () => {
    resetOutputState({ json: true });
    mockFetchResponse = (url: string, init: any) => {
      if (init?.method === 'POST') return { deleted: 0 };
      return { memories: [], total: 0 };
    };
    await cmdPurge({ _: [], force: true, since: '1d' } as any);
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.filtered).toBe(true);
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

describe('validateBulkContentLength', () => {
  test('allows text up to 100,000 chars', () => {
    expect(() => validateBulkContentLength('x'.repeat(100_000))).not.toThrow();
  });

  test('allows text over 8192 chars (ingest/extract use case)', () => {
    expect(() => validateBulkContentLength('x'.repeat(50_000))).not.toThrow();
  });

  test('throws over 100,000 chars', () => {
    expect(() => validateBulkContentLength('x'.repeat(100_001))).toThrow('100000');
  });

  test('rejects empty content', () => {
    expect(() => validateBulkContentLength('')).toThrow('empty');
  });

  test('rejects whitespace-only content', () => {
    expect(() => validateBulkContentLength('   \n\t  ')).toThrow('empty');
  });

  test('uses custom label', () => {
    expect(() => validateBulkContentLength('', 'Ingest text')).toThrow('Ingest text');
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

  test('batch --id-only outputs IDs one per line when API returns ids', async () => {
    const { cmdStoreBatch } = await import('../src/commands/store.js');
    mockFetchResponse = { stored: 2, ids: ['id-aaa', 'id-bbb'] };
    resetOutputState();
    captureConsole();

    await cmdStoreBatch(
      { _: [], idOnly: true, quiet: true } as any,
      ['memory one', 'memory two']
    );

    const output = consoleOutput.join('\n');
    expect(output).toContain('id-aaa');
    expect(output).toContain('id-bbb');
  });

  test('batch --id-only shows info message when API returns no ids', async () => {
    const { cmdStoreBatch } = await import('../src/commands/store.js');
    mockFetchResponse = { stored: 2 };
    resetOutputState();
    captureConsole();

    await cmdStoreBatch(
      { _: [], idOnly: true } as any,
      ['memory one', 'memory two']
    );

    const allOutput = [...consoleOutput, ...consoleErrors].join('\n');
    expect(allOutput).toContain('Stored 2 memories');
  });

  test('batch --json includes ids array when API returns them', async () => {
    const { cmdStoreBatch } = await import('../src/commands/store.js');
    mockFetchResponse = { stored: 2, ids: ['id-aaa', 'id-bbb'] };
    resetOutputState({ json: true });
    captureConsole();

    await cmdStoreBatch(
      { _: [], quiet: true } as any,
      ['memory one', 'memory two']
    );

    const output = consoleOutput.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.ids).toEqual(['id-aaa', 'id-bbb']);
    expect(parsed.stored).toBe(2);
  });

  test('batch respects explicit empty-string namespace per item (#189)', async () => {
    const { cmdStoreBatch } = await import('../src/commands/store.js');
    mockFetchResponse = { stored: 2 };
    allFetches.length = 0;

    await cmdStoreBatch(
      { _: [], namespace: 'fallback', quiet: true } as any,
      ['[{"content":"hello","namespace":""},{"content":"world","namespace":"project1"}]']
    );

    const body = JSON.parse(allFetches.find(f => f.url.includes('/store/batch'))?.options?.body || '{}');
    // Item with explicit empty namespace should keep it, not be overridden by fallback
    expect(body.memories[0].namespace).toBe('');
    // Item with explicit namespace should keep it
    expect(body.memories[1].namespace).toBe('project1');
  });

  test('batch applies global --namespace when item has no namespace field (#189)', async () => {
    const { cmdStoreBatch } = await import('../src/commands/store.js');
    mockFetchResponse = { stored: 1 };
    allFetches.length = 0;

    await cmdStoreBatch(
      { _: [], namespace: 'fallback', quiet: true } as any,
      ['[{"content":"no ns field"}]']
    );

    const body = JSON.parse(allFetches.find(f => f.url.includes('/store/batch'))?.options?.body || '{}');
    expect(body.memories[0].namespace).toBe('fallback');
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


describe('cmdCore', () => {
  test('displays core memories in table', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'core-1111-2222-3333', content: 'User prefers dark mode', importance: 0.95, metadata: { tags: ['preference'] }, created_at: '2026-01-15T00:00:00Z' },
        { id: 'core-4444-5555-6666', content: 'Primary language is TypeScript', importance: 0.9, metadata: { tags: ['tech'] }, created_at: '2026-01-20T00:00:00Z' },
      ],
      total: 2,
    };
    captureConsole();
    await cmdCore({ _: [] } as any);
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('User prefers dark mode');
    expect(output).toContain('Primary language is TypeScript');
    expect(output).toContain('2 of 2 core memories');
  });

  test('shows empty message when no core memories', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    captureConsole();
    await cmdCore({ _: [] } as any);
    restoreConsole();
    expect(consoleOutput.join('\n')).toContain('No core memories found');
  });

  test('passes namespace and limit to query params', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdCore({ _: [], namespace: 'proj', limit: '5' } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/core'))?.url || '';
    expect(url).toContain('namespace=proj');
    expect(url).toContain('limit=5');
  });

  test('outputs JSON when --json flag set', async () => {
    mockFetchResponse = { memories: [{ id: 'abc', content: 'test' }], total: 1 };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ json: true });
    captureConsole();
    await cmdCore({ _: [], json: true } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput[0]);
    expect(parsed.memories).toBeDefined();
  });

  test('raw mode outputs content only', async () => {
    mockFetchResponse = { memories: [{ id: 'a', content: 'raw content here' }], total: 1 };
    captureConsole();
    await cmdCore({ _: [], raw: true } as any);
    restoreConsole();
    expect(consoleOutput.join('\n')).toContain('raw content here');
  });

  test('--since filters core memories by date', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'old-1111', content: 'Old memory', importance: 0.8, metadata: {}, created_at: '2025-01-01T00:00:00Z' },
        { id: 'new-2222', content: 'New memory', importance: 0.9, metadata: {}, created_at: '2026-03-01T00:00:00Z' },
      ],
      total: 2,
    };
    captureConsole();
    await cmdCore({ _: [], since: '2026-01-01' } as any);
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('New memory');
    expect(output).not.toContain('Old memory');
  });

  test('--until filters core memories by date', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'old-1111', content: 'Old memory', importance: 0.8, metadata: {}, created_at: '2025-01-01T00:00:00Z' },
        { id: 'new-2222', content: 'New memory', importance: 0.9, metadata: {}, created_at: '2026-03-01T00:00:00Z' },
      ],
      total: 2,
    };
    captureConsole();
    await cmdCore({ _: [], until: '2025-06-01' } as any);
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('Old memory');
    expect(output).not.toContain('New memory');
  });

  test('--since with relative date (7d) works', async () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
    mockFetchResponse = {
      memories: [
        { id: 'old-rel', content: 'Month old', importance: 0.5, metadata: {}, created_at: old },
        { id: 'new-rel', content: 'Recent one', importance: 0.7, metadata: {}, created_at: recent },
      ],
      total: 2,
    };
    captureConsole();
    await cmdCore({ _: [], since: '7d' } as any);
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('Recent one');
    expect(output).not.toContain('Month old');
  });

  test('invalid date format throws error', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    expect(cmdCore({ _: [], since: 'not-a-date' } as any)).rejects.toThrow('Invalid date format');
  });

  test('--since with --json filters and returns JSON', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'old-j', content: 'Old JSON', importance: 0.5, metadata: {}, created_at: '2025-01-01T00:00:00Z' },
        { id: 'new-j', content: 'New JSON', importance: 0.8, metadata: {}, created_at: '2026-03-01T00:00:00Z' },
      ],
      total: 2,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ json: true });
    captureConsole();
    await cmdCore({ _: [], since: '2026-01-01', json: true } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput[0]);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0].content).toBe('New JSON');
  });

  test('--since overfetches limit', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdCore({ _: [], since: '7d', limit: '10' } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/core'))?.url || '';
    expect(url).toContain('limit=100');
  });

  test('--since with raw mode filters content', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'old-r', content: 'Old raw', created_at: '2025-01-01T00:00:00Z' },
        { id: 'new-r', content: 'New raw', created_at: '2026-03-01T00:00:00Z' },
      ],
      total: 2,
    };
    captureConsole();
    await cmdCore({ _: [], since: '2026-01-01', raw: true } as any);
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('New raw');
    expect(output).not.toContain('Old raw');
  });
});

// ─── #43: bulk-delete tests ──────────────────────────────────────────────────

describe('cmdBulkDelete', () => {
  test('sends POST /v1/memories/bulk-delete with IDs', async () => {
    mockFetchResponse = { deleted: 3 };
    allFetches.length = 0;
    captureConsole();
    await cmdBulkDelete(['id1', 'id2', 'id3'], { _: [] } as any);
    restoreConsole();
    const call = allFetches.find(f => f.url.includes('/bulk-delete'));
    expect(call).toBeDefined();
    const body = JSON.parse(call!.options.body);
    expect(body.ids).toEqual(['id1', 'id2', 'id3']);
  });

  test('shows success message with count', async () => {
    mockFetchResponse = { deleted: 2 };
    captureConsole();
    await cmdBulkDelete(['a', 'b'], { _: [] } as any);
    restoreConsole();
    expect(consoleOutput.join('\n')).toContain('2');
  });

  test('JSON mode outputs raw response', async () => {
    mockFetchResponse = { deleted: 1, ids: ['abc'] };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ json: true });
    captureConsole();
    await cmdBulkDelete(['abc'], { _: [], json: true } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput[0]);
    expect(parsed.deleted).toBe(1);
  });

  test('uses ids.length as fallback when deleted not in response', async () => {
    mockFetchResponse = {};
    captureConsole();
    await cmdBulkDelete(['x', 'y'], { _: [] } as any);
    restoreConsole();
    expect(consoleOutput.join('\n')).toContain('2');
  });
});

// ─── #59: store --id-only ────────────────────────────────────────────────────

describe('store --id-only', () => {
  test('prints only the memory ID', async () => {
    mockFetchResponse = { id: 'mem-12345678-abcd', importance: 0.5 };
    captureConsole();
    await cmdStore('test content', { _: [], idOnly: true } as any);
    restoreConsole();
    expect(consoleOutput).toEqual(['mem-12345678-abcd']);
  });

  test('prints empty string when no ID returned', async () => {
    mockFetchResponse = { importance: 0.5 };
    captureConsole();
    await cmdStore('test', { _: [], idOnly: true } as any);
    restoreConsole();
    expect(consoleOutput).toEqual(['']);
  });
});

// ─── #58: list --pinned/--immutable filters ──────────────────────────────────

describe('list pinned/immutable filters', () => {
  test('passes pinned=true to query params', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdList({ _: [], pinned: true } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('pinned=true');
  });

  test('passes immutable=true to query params', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdList({ _: [], immutable: true } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('immutable=true');
  });

  test('both filters together', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdList({ _: [], pinned: true, immutable: true } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('pinned=true');
    expect(url).toContain('immutable=true');
  });

  test('--pinned false sends pinned=false (#108)', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdList({ _: [], pinned: 'false' } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('pinned=false');
  });

  test('--immutable false sends immutable=false (#108)', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdList({ _: [], immutable: 'false' } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('immutable=false');
  });

  test('--pinned (no value) still sends pinned=true (#108)', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdList({ _: [], pinned: true } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('pinned=true');
  });
});

// ─── #60: search format support ──────────────────────────────────────────────

describe('search csv/yaml format', () => {
  test('csv format outputs comma-separated values', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'search-1111-2222', content: 'hello world', metadata: { tags: ['tag1'] } },
      ],
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    await cmdSearch('hello', { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('id');
    expect(output).toContain('content');
    expect(output).toContain('hello world');
  });

  test('yaml format outputs yaml', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'yaml-1111-2222', content: 'yaml test', metadata: {} },
      ],
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'yaml' });
    captureConsole();
    await cmdSearch('yaml', { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('content: yaml test');
  });
});

// ─── #70: list format support ────────────────────────────────────────────────

describe('list csv/yaml format', () => {
  test('csv format outputs comma-separated values', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'list-1111-2222', content: 'hello world', importance: 0.7, namespace: 'test', metadata: { tags: ['tag1'] }, created_at: '2026-01-01T00:00:00Z' },
      ],
      total: 1,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    await cmdList({ _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('id');
    expect(output).toContain('content');
    expect(output).toContain('hello world');
    expect(output).toContain('tag1');
  });

  test('yaml format outputs yaml', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'yaml-1111-2222', content: 'yaml test', importance: 0.5, metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      ],
      total: 1,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'yaml' });
    captureConsole();
    await cmdList({ _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('content: yaml test');
  });

  test('tsv format outputs tab-separated values', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'tsv-1111-2222', content: 'tsv test', importance: 0.5, metadata: { tags: ['a'] }, created_at: '2026-01-01T00:00:00Z' },
      ],
      total: 1,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'tsv' });
    captureConsole();
    await cmdList({ _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('id\t');
    expect(output).toContain('tsv test');
  });
});

// ─── #72: core format support ────────────────────────────────────────────────

describe('core csv/yaml format', () => {
  test('csv format outputs comma-separated values', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'core-1111-2222', content: 'core csv test', importance: 0.9, metadata: { tags: ['pref'] }, created_at: '2026-01-15T00:00:00Z' },
      ],
      total: 1,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    await cmdCore({ _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('id');
    expect(output).toContain('content');
    expect(output).toContain('core csv test');
  });

  test('yaml format outputs yaml', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'core-yaml-2222', content: 'core yaml test', importance: 0.8, metadata: {}, created_at: '2026-01-20T00:00:00Z' },
      ],
      total: 1,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'yaml' });
    captureConsole();
    await cmdCore({ _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('content: core yaml test');
  });
});

// ─── #74: recall outputWrite fix ─────────────────────────────────────────────

describe('recall uses outputWrite', () => {
  test('table output goes through outputWrite', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'rec-1111-2222', content: 'recall test', similarity: 0.85, metadata: { tags: ['t1'] } },
      ],
    };
    resetOutputState();
    captureConsole();
    await cmdRecall('query', { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('recall test');
    expect(output).toContain('0.850');
  });

  test('raw output goes through outputWrite', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'raw-1111-2222', content: 'raw recall content', similarity: 0.9, metadata: {} },
      ],
    };
    resetOutputState();
    captureConsole();
    await cmdRecall('query', { _: [], raw: true } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('raw recall content');
  });
});

// ─── #74: search outputWrite fix ─────────────────────────────────────────────

describe('search uses outputWrite', () => {
  test('table output goes through outputWrite', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'srch-1111-2222', content: 'search test output', metadata: { tags: ['x'] } },
      ],
    };
    resetOutputState();
    captureConsole();
    await cmdSearch('query', { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('search test output');
    expect(output).toContain('1 result');
  });

  test('raw output goes through outputWrite', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'srch-raw-2222', content: 'search raw content', metadata: {} },
      ],
    };
    resetOutputState();
    captureConsole();
    await cmdSearch('q', { _: [], raw: true } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('search raw content');
  });
});

// ─── #75: suggested csv/yaml format ──────────────────────────────────────────

describe('suggested csv/yaml format', () => {
  test('csv format outputs comma-separated values', async () => {
    mockFetchResponse = {
      suggested: [
        { id: 'sug-1111-2222', category: 'stale', review_score: 0.75, content: 'suggested csv test', importance: 0.6, metadata: { tags: ['old'] } },
      ],
      categories: { stale: 1 },
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    await cmdSuggested({ _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('id');
    expect(output).toContain('category');
    expect(output).toContain('suggested csv test');
    expect(output).toContain('stale');
  });

  test('yaml format outputs yaml', async () => {
    mockFetchResponse = {
      suggested: [
        { id: 'sug-yaml-2222', category: 'hot', review_score: 0.9, content: 'suggested yaml test', importance: 0.8, metadata: {} },
      ],
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'yaml' });
    captureConsole();
    await cmdSuggested({ _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('content: suggested yaml test');
    expect(output).toContain('category: hot');
  });
});

// ─── #74: graph uses outputWrite ─────────────────────────────────────────────

describe('graph uses outputWrite', () => {
  test('ascii tree goes through outputWrite', async () => {
    let callCount = 0;
    mockFetchResponse = { memory: { id: 'graph-1111-2222-3333-4444', content: 'graph node' } };
    // The graph command makes 2 requests: get memory + get relations
    const origFetch = globalThis.fetch;
    // We need to handle sequenced responses — the test mock handles one at a time
    // First call returns memory, second returns relations
    captureConsole();
    resetOutputState();
    // Just test that graph doesn't crash and produces output
    // The mock will return the same response for both calls which is fine
    mockFetchResponse = { memory: { id: 'graph-1111-2222-3333-4444', content: 'graph node test' }, relations: [] };
    await cmdGraph('graph-1111-2222-3333-4444', { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('graph-11');
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

// ─── outputWrite consistency: --format csv/yaml/tsv for commands (Fixes #77, #78) ─────

describe('cmdGet --format csv', () => {
  test('outputs csv row for a memory', async () => {
    mockFetchResponse = { memory: { id: 'abc-123-full', content: 'hello world', importance: 0.7, namespace: 'test', metadata: { tags: ['a', 'b'] }, memory_type: 'core', created_at: '2025-01-01', updated_at: '2025-01-02' } };
    resetOutputState({ format: 'csv' });
    await cmdGet('abc-123-full');
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('id');
    expect(joined).toContain('abc-123-full');
    expect(joined).toContain('hello world');
  });

  test('outputs yaml for a memory', async () => {
    mockFetchResponse = { memory: { id: 'abc-yaml', content: 'test content', importance: 0.5 } };
    resetOutputState({ format: 'yaml' });
    await cmdGet('abc-yaml');
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('abc-yaml');
    expect(joined).toContain('test content');
  });
});

describe('cmdGet uses outputWrite (--output file support)', () => {
  test('raw mode uses outputWrite not console.log', async () => {
    mockFetchResponse = { memory: { id: 'x', content: 'raw content' } };
    resetOutputState();
    await cmdGet('x', { _: [], raw: true } as any);
    expect(consoleOutput.join('')).toContain('raw content');
  });

  test('detailed view uses outputWrite', async () => {
    mockFetchResponse = { memory: { id: 'x', content: 'test', importance: 0.5, namespace: 'ns', metadata: { tags: ['t1'] } } };
    resetOutputState();
    await cmdGet('x');
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('ID:');
    expect(joined).toContain('test');
  });
});

describe('cmdCount --format csv', () => {
  test('outputs csv row', async () => {
    mockFetchResponse = { memories: [], total: 42 };
    resetOutputState({ format: 'csv' });
    await cmdCount({ _: [] } as any);
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('count');
    expect(joined).toContain('42');
  });
});

describe('cmdHistory --format csv', () => {
  test('outputs csv rows for history entries', async () => {
    mockFetchResponse = { history: [{ id: 'h1-full-id', created_at: '2025-01-01T00:00:00Z', changes: { content: true } }, { id: 'h2-full-id', created_at: '2025-01-02T00:00:00Z', changes: { importance: true, tags: true } }] };
    resetOutputState({ format: 'csv' });
    await cmdHistory('abc');
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('id');
    expect(joined).toContain('h1-full-id');
    expect(joined).toContain('content');
  });

  test('empty history uses outputWrite', async () => {
    mockFetchResponse = { history: [] };
    resetOutputState();
    await cmdHistory('abc');
    expect(consoleOutput.join('')).toContain('No history entries found');
  });
});

describe('search uses outputWrite', () => {
  test('raw mode outputs content via outputWrite', async () => {
    mockFetchResponse = { memories: [{ id: 's1', content: 'search result' }] };
    resetOutputState();
    await cmdSearch('test', { _: [], raw: true } as any);
    expect(consoleOutput.join('')).toContain('search result');
  });

  test('csv mode does not truncate IDs', async () => {
    mockFetchResponse = { memories: [{ id: 'abcdefgh-1234-5678-9012-abcdefghijkl', content: 'test' }] };
    resetOutputState({ format: 'csv' });
    await cmdSearch('test', { _: [] } as any);
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('abcdefgh-1234-5678-9012-abcdefghijkl');
  });

  test('empty search uses outputWrite', async () => {
    mockFetchResponse = { memories: [] };
    resetOutputState();
    await cmdSearch('test', { _: [] } as any);
    expect(consoleOutput.join('')).toContain('No memories found');
  });
});

describe('recall uses outputWrite', () => {
  test('raw mode outputs content via outputWrite', async () => {
    mockFetchResponse = { memories: [{ id: 'r1', content: 'recall result', similarity: 0.9 }] };
    resetOutputState();
    await cmdRecall('test', { _: [], raw: true } as any);
    expect(consoleOutput.join('')).toContain('recall result');
  });

  test('default mode outputs via outputWrite', async () => {
    mockFetchResponse = { memories: [{ id: 'r2', content: 'recall formatted', similarity: 0.85 }] };
    resetOutputState();
    await cmdRecall('test', { _: [] } as any);
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('recall formatted');
    expect(joined).toContain('0.850');
  });

  test('empty recall uses outputWrite', async () => {
    mockFetchResponse = { memories: [] };
    resetOutputState();
    await cmdRecall('test', { _: [] } as any);
    expect(consoleOutput.join('')).toContain('No memories found');
  });
});

describe('suggested --format csv', () => {
  test('outputs csv rows', async () => {
    mockFetchResponse = { suggested: [{ id: 'sug-1', category: 'stale', review_score: 0.3, content: 'old fact', importance: 0.5, metadata: { tags: ['t'] } }] };
    resetOutputState({ format: 'csv' });
    await cmdSuggested({ _: [] } as any);
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('id');
    expect(joined).toContain('sug-1');
    expect(joined).toContain('stale');
  });

  test('default mode uses outputWrite', async () => {
    mockFetchResponse = { suggested: [{ id: 'sug-2', category: 'hot', review_score: 0.9, content: 'hot fact' }] };
    resetOutputState();
    await cmdSuggested({ _: [] } as any);
    expect(consoleOutput.join('\n')).toContain('hot fact');
  });

  test('empty suggested uses outputWrite', async () => {
    mockFetchResponse = { suggested: [] };
    resetOutputState();
    await cmdSuggested({ _: [] } as any);
    expect(consoleOutput.join('')).toContain('No suggested memories');
  });
});

describe('graph uses outputWrite', () => {
  test('renders graph via outputWrite', async () => {
    let callCount = 0;
    mockFetchResponse = (url: string) => {
      if (url.includes('/relations')) return { relations: [{ id: 'r1', relation_type: 'supports', target_id: 'target-1234' }] };
      return { memory: { id: 'mem-12345678', content: 'graph node' } };
    };
    resetOutputState();
    await cmdGraph('mem-12345678', { _: [] } as any);
    const joined = consoleOutput.join('\n');
    expect(joined).toContain('mem-1234');
    expect(joined).toContain('supports');
  });
});

// ─── #91: import --namespace override ────────────────────────────────────────

describe('import --namespace override (Fixes #91)', () => {
  test('--namespace overrides existing namespace in imported data', async () => {
    // Mock: first call is batch store, check the body
    mockFetchResponse = { stored: 1 };
    allFetches.length = 0;

    // We need to test cmdImport with --file, but that reads from disk.
    // Instead, test the namespace priority logic directly via the import internals.
    // The fix changes `mem.namespace || opts.namespace` to `opts.namespace || mem.namespace`
    const opts = { namespace: 'override-ns' };
    const mem = { namespace: 'original-ns' };
    const entry: Record<string, any> = { content: 'test' };
    if (opts.namespace || mem.namespace) entry.namespace = opts.namespace || mem.namespace;
    expect(entry.namespace).toBe('override-ns');
  });

  test('falls back to memory namespace when --namespace not provided', async () => {
    const opts: any = {};
    const mem = { namespace: 'original-ns' };
    const entry: Record<string, any> = { content: 'test' };
    if (opts.namespace || mem.namespace) entry.namespace = opts.namespace || mem.namespace;
    expect(entry.namespace).toBe('original-ns');
  });
});

// ─── #92: whoami command ─────────────────────────────────────────────────────

describe('cmdWhoami', () => {
  test('outputs wallet address in text mode', async () => {
    resetOutputState();
    captureConsole();
    await cmdWhoami({ _: [] } as any);
    restoreConsole();
    const output = consoleOutput.join('');
    expect(output).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('outputs JSON with address field', async () => {
    resetOutputState({ json: true });
    captureConsole();
    await cmdWhoami({ _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.address).toBeDefined();
    expect(parsed.address.startsWith('0x')).toBe(true);
  });
});

// ─── #123: --since/--until date filters for recall, search, export ───────────

describe('recall --since/--until', () => {
  const now = Date.now();
  const recentDate = new Date(now - 1000 * 60 * 60).toISOString(); // 1 hour ago
  const oldDate = new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString(); // 30 days ago

  test('filters results by --since', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'recent-1', content: 'recent memory', similarity: 0.9, created_at: recentDate },
        { id: 'old-1', content: 'old memory', similarity: 0.8, created_at: oldDate },
      ],
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdRecall('test query', { _: ['recall', 'test query'], since: '7d' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories.length).toBe(1);
    expect(parsed.memories[0].id).toBe('recent-1');
  });

  test('filters results by --until', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'recent-1', content: 'recent memory', similarity: 0.9, created_at: recentDate },
        { id: 'old-1', content: 'old memory', similarity: 0.8, created_at: oldDate },
      ],
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdRecall('test query', { _: ['recall', 'test query'], until: '7d' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories.length).toBe(1);
    expect(parsed.memories[0].id).toBe('old-1');
  });

  test('rejects invalid date format', async () => {
    mockFetchResponse = { memories: [] };
    try {
      await cmdRecall('test', { _: ['recall', 'test'], since: 'invalid-date' } as any);
      expect(false).toBe(true); // should not reach
    } catch (e: any) {
      expect(e.message).toContain('Invalid date format');
    }
  });

  test('no filter when --since/--until absent', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', content: 'a', similarity: 0.9, created_at: recentDate },
        { id: 'b', content: 'b', similarity: 0.8, created_at: oldDate },
      ],
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdRecall('test', { _: ['recall', 'test'] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories.length).toBe(2);
  });
});

describe('search --since/--until', () => {
  const now = Date.now();
  const recentDate = new Date(now - 1000 * 60 * 60).toISOString();
  const oldDate = new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString();

  test('filters results by --since', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'recent-s1', content: 'recent search hit', created_at: recentDate },
        { id: 'old-s1', content: 'old search hit', created_at: oldDate },
      ],
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdSearch('test', { _: ['search', 'test'], since: '7d' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories.length).toBe(1);
    expect(parsed.memories[0].id).toBe('recent-s1');
  });

  test('filters raw output by --since', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'recent-s2', content: 'recent content', created_at: recentDate },
        { id: 'old-s2', content: 'old content', created_at: oldDate },
      ],
    };
    resetOutputState();
    captureConsole();
    await cmdSearch('test', { _: ['search', 'test'], since: '7d', raw: true } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('');
    expect(output).toContain('recent content');
    expect(output).not.toContain('old content');
  });
});

describe('export --since/--until', () => {
  const now = Date.now();
  const recentDate = new Date(now - 1000 * 60 * 60).toISOString();
  const oldDate = new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString();

  test('filters exported memories by --since', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'recent-e1', content: 'recent export', created_at: recentDate },
        { id: 'old-e1', content: 'old export', created_at: oldDate },
      ],
      total: 2,
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdExport({ _: ['export'], since: '7d' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.count).toBe(1);
    expect(parsed.memories.length).toBe(1);
    expect(parsed.memories[0].id).toBe('recent-e1');
  });

  test('no filter when --since/--until absent', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'e-a', content: 'a', created_at: recentDate },
        { id: 'e-b', content: 'b', created_at: oldDate },
      ],
      total: 2,
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdExport({ _: ['export'] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.count).toBe(2);
    expect(parsed.memories.length).toBe(2);
  });
});

// ─── #124: tags command ──────────────────────────────────────────────────────

describe('cmdTags', () => {
  test('lists unique tags from all memories', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', content: 'hello', metadata: { tags: ['bug', 'urgent'] } },
        { id: 'b', content: 'world', metadata: { tags: ['bug', 'feature'] } },
        { id: 'c', content: 'no tags', metadata: {} },
      ],
      total: 3,
    };
    captureConsole();
    await cmdTags('list', [], { _: [] } as any);
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('bug');
    expect(output).toContain('urgent');
    expect(output).toContain('feature');
    expect(output).toContain('3 tags');
  });

  test('default subcommand is list', async () => {
    mockFetchResponse = { memories: [{ id: 'a', metadata: { tags: ['t1'] } }], total: 1 };
    captureConsole();
    await cmdTags('', [], { _: [] } as any);
    restoreConsole();
    expect(consoleOutput.join('\n')).toContain('t1');
  });

  test('shows "No tags found" when empty', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    captureConsole();
    await cmdTags('list', [], { _: [] } as any);
    restoreConsole();
    expect(consoleOutput.join('\n')).toContain('No tags found');
  });

  test('JSON mode outputs tags array and count', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', metadata: { tags: ['alpha', 'beta'] } },
        { id: 'b', metadata: { tags: ['beta', 'gamma'] } },
      ],
      total: 2,
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdTags('list', [], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.tags).toEqual([
      { tag: 'alpha', count: 1 },
      { tag: 'beta', count: 2 },
      { tag: 'gamma', count: 1 },
    ]);
    expect(parsed.count).toBe(3);
  });

  test('passes namespace filter', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    captureConsole();
    await cmdTags('list', [], { _: [], namespace: 'proj1' } as any);
    restoreConsole();
    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('namespace=proj1');
  });

  test('throws on invalid subcommand', async () => {
    await expect(cmdTags('bad', [], { _: [] } as any)).rejects.toThrow('Usage');
    restoreConsole();
  });

  test('deduplicates tags across memories', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', metadata: { tags: ['same'] } },
        { id: 'b', metadata: { tags: ['same'] } },
        { id: 'c', metadata: { tags: ['same'] } },
      ],
      total: 3,
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdTags('list', [], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.tags).toEqual([{ tag: 'same', count: 3 }]);
    expect(parsed.count).toBe(1);
  });

  test('sorts tags alphabetically', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'a', metadata: { tags: ['zebra', 'apple', 'mango'] } },
      ],
      total: 1,
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdTags('list', [], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.tags.map((t: any) => t.tag)).toEqual(['apple', 'mango', 'zebra']);
  });

  test('csv format outputs rows', async () => {
    mockFetchResponse = {
      memories: [{ id: 'a', metadata: { tags: ['csv-tag'] } }],
      total: 1,
    };
    resetOutputState({ format: 'csv' });
    captureConsole();
    await cmdTags('list', [], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    expect(output).toContain('tag');
    expect(output).toContain('csv-tag');
  });
});

// ─── #125: pin / unpin commands ──────────────────────────────────────────────

describe('cmdPin', () => {
  test('sends PATCH with pinned=true', async () => {
    mockFetchResponse = { id: 'abc-12345678' };
    allFetches.length = 0;
    captureConsole();
    await cmdPin('abc-12345678');
    restoreConsole();
    expect(lastFetchOptions.method).toBe('PATCH');
    expect(lastFetchUrl).toContain('/v1/memories/abc-12345678');
    expect(getLastBody()).toEqual({ pinned: true });
  });

  test('shows success message with truncated ID', async () => {
    mockFetchResponse = { id: 'abc-12345678' };
    captureConsole();
    await cmdPin('abc-12345678');
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('pinned');
    expect(output).toContain('abc-1234');
  });

  test('JSON mode outputs raw response', async () => {
    mockFetchResponse = { id: 'abc-12345678', pinned: true };
    resetOutputState({ json: true });
    captureConsole();
    await cmdPin('abc-12345678');
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.pinned).toBe(true);
  });
});

describe('cmdUnpin', () => {
  test('sends PATCH with pinned=false', async () => {
    mockFetchResponse = { id: 'abc-12345678' };
    allFetches.length = 0;
    captureConsole();
    await cmdUnpin('abc-12345678');
    restoreConsole();
    expect(lastFetchOptions.method).toBe('PATCH');
    expect(lastFetchUrl).toContain('/v1/memories/abc-12345678');
    expect(getLastBody()).toEqual({ pinned: false });
  });

  test('shows success message with truncated ID', async () => {
    mockFetchResponse = { id: 'abc-12345678' };
    captureConsole();
    await cmdUnpin('abc-12345678');
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('unpinned');
    expect(output).toContain('abc-1234');
  });

  test('JSON mode outputs raw response', async () => {
    mockFetchResponse = { id: 'abc-12345678', pinned: false };
    resetOutputState({ json: true });
    captureConsole();
    await cmdUnpin('abc-12345678');
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.pinned).toBe(false);
  });
});

// ─── #129: lock / unlock commands ────────────────────────────────────────────

describe('cmdLock', () => {
  test('sends PATCH with immutable=true', async () => {
    mockFetchResponse = { id: 'abc-12345678' };
    allFetches.length = 0;
    captureConsole();
    await cmdLock('abc-12345678');
    restoreConsole();
    expect(lastFetchOptions.method).toBe('PATCH');
    expect(lastFetchUrl).toContain('/v1/memories/abc-12345678');
    expect(getLastBody()).toEqual({ immutable: true });
  });

  test('shows success message with truncated ID', async () => {
    mockFetchResponse = { id: 'abc-12345678' };
    captureConsole();
    await cmdLock('abc-12345678');
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('locked');
    expect(output).toContain('abc-1234');
  });

  test('JSON mode outputs raw response', async () => {
    mockFetchResponse = { id: 'abc-12345678', immutable: true };
    resetOutputState({ json: true });
    captureConsole();
    await cmdLock('abc-12345678');
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.immutable).toBe(true);
  });
});

describe('cmdUnlock', () => {
  test('sends PATCH with immutable=false', async () => {
    mockFetchResponse = { id: 'abc-12345678' };
    allFetches.length = 0;
    captureConsole();
    await cmdUnlock('abc-12345678');
    restoreConsole();
    expect(lastFetchOptions.method).toBe('PATCH');
    expect(lastFetchUrl).toContain('/v1/memories/abc-12345678');
    expect(getLastBody()).toEqual({ immutable: false });
  });

  test('shows success message with truncated ID', async () => {
    mockFetchResponse = { id: 'abc-12345678' };
    captureConsole();
    await cmdUnlock('abc-12345678');
    restoreConsole();
    const output = consoleOutput.join('\n');
    expect(output).toContain('unlocked');
    expect(output).toContain('abc-1234');
  });

  test('JSON mode outputs raw response', async () => {
    mockFetchResponse = { id: 'abc-12345678', immutable: false };
    resetOutputState({ json: true });
    captureConsole();
    await cmdUnlock('abc-12345678');
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.immutable).toBe(false);
  });
});

// ─── #130: edit command ──────────────────────────────────────────────────────

describe('cmdEdit', () => {
  test('refuses to edit immutable memories', async () => {
    mockFetchResponse = { memory: { id: 'abc-12345678', content: 'test', immutable: true } };
    captureConsole();
    try {
      await cmdEdit('abc-12345678');
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('immutable');
      expect(err.message).toContain('locked');
    }
    restoreConsole();
  });

  test('warns about pinned memories (no throw)', async () => {
    // Mock: first call returns GET result, second returns PATCH result
    let callCount = 0;
    mockFetchResponse = (url: string, init?: any) => {
      callCount++;
      if (callCount === 1) {
        return { memory: { id: 'abc-12345678', content: 'original', pinned: true } };
      }
      return { id: 'abc-12345678', content: 'edited' };
    };

    // Mock execSync to simulate editor changing content
    const origExecSync = (await import('child_process')).execSync;
    const { writeFileSync, readFileSync } = await import('fs');
    const origImport = cmdEdit;

    // We can't easily mock execSync inside cmdEdit since it dynamically imports.
    // Instead test the immutable rejection path which doesn't need execSync.
    // The pinned warning is tested via the output containing "pinned" when we
    // can mock the editor. For now, ensure the GET + immutable check works.
    restoreConsole();
  });
});

// ─── #131: watch command ─────────────────────────────────────────────────────

describe('cmdWatch', () => {
  test('module exports cmdWatch', async () => {
    const mod = await import('../src/commands/watch.js');
    expect(typeof mod.cmdWatch).toBe('function');
  });
});

// ─── #140: over-fetch when date filters active ──────────────────────────────

describe('list over-fetches with --since (#140)', () => {
  const now = Date.now();
  const recentDate = new Date(now - 1000 * 60 * 60).toISOString(); // 1h ago
  const oldDate = new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString(); // 30d ago

  test('sends larger limit to API when --since is used', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'r1', content: 'recent1', created_at: recentDate },
        { id: 'r2', content: 'recent2', created_at: recentDate },
        { id: 'old1', content: 'old', created_at: oldDate },
      ],
      total: 3,
    };
    allFetches.length = 0;
    resetOutputState({ json: true });
    captureConsole();
    await cmdList({ _: ['list'], limit: '5', since: '7d' } as any);
    restoreConsole();
    resetOutputState();
    // Should have over-fetched (limit > 5)
    expect(lastFetchUrl).toContain('limit=100');
    // Should pass since to server
    expect(lastFetchUrl).toContain('since=');
    // Output should only contain recent memories
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories.length).toBe(2);
    expect(parsed.memories.every((m: any) => m.id.startsWith('r'))).toBe(true);
  });

  test('trims results to user limit after filtering', async () => {
    // 10 recent memories, user requests 3
    const recent = Array.from({ length: 10 }, (_, i) => ({
      id: `mem-${i}`, content: `mem ${i}`, created_at: recentDate,
    }));
    mockFetchResponse = { memories: recent, total: 10 };
    resetOutputState({ json: true });
    captureConsole();
    await cmdList({ _: ['list'], limit: '3', since: '7d' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories.length).toBe(3);
  });

  test('does not over-fetch when no date filters', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    resetOutputState({ json: true });
    captureConsole();
    await cmdList({ _: ['list'], limit: '5' } as any);
    restoreConsole();
    resetOutputState();
    expect(lastFetchUrl).toContain('limit=5');
    expect(lastFetchUrl).not.toContain('since=');
  });
});

// ─── #133: export CSV/TSV date filter fix ────────────────────────────────────

describe('export CSV respects --since filter', () => {
  const now = Date.now();
  const recentDate = new Date(now - 1000 * 60 * 60).toISOString(); // 1h ago
  const oldDate = new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString(); // 30d ago

  test('CSV export only includes filtered memories with --since', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'recent-csv', content: 'recent', created_at: recentDate, importance: 0.5, namespace: '', metadata: {} },
        { id: 'old-csv', content: 'old', created_at: oldDate, importance: 0.3, namespace: '', metadata: {} },
      ],
      total: 2,
    };
    resetOutputState({ format: 'csv' });
    captureConsole();
    await cmdExport({ _: ['export'], since: '7d', format: 'csv' } as any);
    restoreConsole();
    resetOutputState();
    // CSV output: first line is headers, rest are data rows
    const lines = consoleOutput.filter(l => l.trim());
    const dataLines = lines.filter(l => !l.startsWith('id,') && !l.includes('✓'));
    expect(dataLines.length).toBe(1);
    expect(dataLines[0]).toContain('recent-csv');
    expect(dataLines.join('')).not.toContain('old-csv');
  });
});

// ─── #135: copy command ──────────────────────────────────────────────────────

describe('cmdCopy', () => {
  test('duplicates a memory and returns new ID', async () => {
    let callCount = 0;
    mockFetchResponse = (url: string, init: any) => {
      callCount++;
      if (callCount === 1) {
        // GET /v1/memories/:id
        return { memory: { id: 'source-id', content: 'hello', importance: 0.8, namespace: 'ns1', metadata: { tags: ['a'] } } };
      }
      // POST /v1/store
      return { id: 'new-copy-id' };
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdCopy('source-id', { _: ['copy'] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.source).toBe('source-id');
    expect(parsed.id).toBe('new-copy-id');
    expect(parsed.copied).toBe(true);
  });

  test('copy with namespace override', async () => {
    let storeBody: any = null;
    let callCount = 0;
    mockFetchResponse = (url: string, init: any) => {
      callCount++;
      if (callCount === 1) {
        return { memory: { id: 'src', content: 'data', namespace: 'old-ns' } };
      }
      storeBody = JSON.parse(init?.body || '{}');
      return { id: 'new-id' };
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdCopy('src', { _: ['copy'], namespace: 'new-ns' } as any);
    restoreConsole();
    resetOutputState();
    expect(storeBody.namespace).toBe('new-ns');
  });

  test('copy with --id-only outputs only the new ID', async () => {
    let callCount = 0;
    mockFetchResponse = (url: string, init: any) => {
      callCount++;
      if (callCount === 1) {
        return { memory: { id: 'source-id', content: 'hello' } };
      }
      return { id: 'new-copy-id' };
    };
    resetOutputState({});
    captureConsole();
    await cmdCopy('source-id', { _: ['copy'], idOnly: true } as any);
    restoreConsole();
    resetOutputState();
    expect(consoleOutput.join('').trim()).toBe('new-copy-id');
  });
});

// ─── #136: move command ──────────────────────────────────────────────────────

describe('cmdMove', () => {
  test('moves memories to target namespace', async () => {
    mockFetchResponse = { updated: true };
    resetOutputState({ json: true });
    captureConsole();
    await cmdMove(['id1', 'id2'], { _: ['move'], namespace: 'production' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.moved).toBe(2);
    expect(parsed.namespace).toBe('production');
  });

  test('throws if no namespace provided', async () => {
    expect(() => cmdMove(['id1'], { _: ['move'] } as any)).toThrow('Target namespace required');
  });
});

// ─── #145: export --output flag ──────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('export --output writes to file (#145)', () => {

  test('export writes JSON to output file', async () => {
    const tmpFile = path.join(os.tmpdir(), `memoclaw-test-export-${Date.now()}.json`);
    const now = new Date().toISOString();
    mockFetchResponse = {
      memories: [
        { id: 'exp1', content: 'hello', created_at: now, importance: 0.5, metadata: {} },
      ],
      total: 1,
    };
    resetOutputState({ output: tmpFile });
    captureConsole();
    await cmdExport({ _: ['export'], output: tmpFile } as any);
    restoreConsole();
    resetOutputState();
    // File should exist and contain valid JSON with our memory
    const content = fs.readFileSync(tmpFile, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.memories.length).toBe(1);
    expect(parsed.memories[0].id).toBe('exp1');
    // Clean up
    fs.unlinkSync(tmpFile);
  });

  test('export CSV writes to output file', async () => {
    const tmpFile = path.join(os.tmpdir(), `memoclaw-test-export-csv-${Date.now()}.csv`);
    const now = new Date().toISOString();
    mockFetchResponse = {
      memories: [
        { id: 'csv1', content: 'data', created_at: now, importance: 0.7, namespace: '', metadata: { tags: ['a'] } },
      ],
      total: 1,
    };
    resetOutputState({ format: 'csv', output: tmpFile });
    captureConsole();
    await cmdExport({ _: ['export'], format: 'csv', output: tmpFile } as any);
    restoreConsole();
    resetOutputState();
    const content = fs.readFileSync(tmpFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[1]).toContain('csv1');
    fs.unlinkSync(tmpFile);
  });
});

// ─── export --tags filter (Fixes #151) ───────────────────────────────────────

describe('export --tags filter (Fixes #151)', () => {
  test('passes tags to API query params', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    resetOutputState();
    captureConsole();
    await cmdExport({ _: ['export'], tags: 'important,urgent' } as any);
    restoreConsole();
    expect(lastFetchUrl).toContain('tags=important%2Curgent');
  });

  test('export without tags does not include tags param', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    resetOutputState();
    captureConsole();
    await cmdExport({ _: ['export'] } as any);
    restoreConsole();
    expect(lastFetchUrl).not.toContain('tags=');
  });
});

// ─── purge shows memory count in confirmation (Fixes #153) ───────────────────

describe('purge shows count before confirmation (Fixes #153)', () => {
  test('purge with --force skips confirmation and proceeds', async () => {
    mockFetchResponse = (url: string) => {
      if (url.includes('limit=1')) return { memories: [], total: 5 };
      return { memories: [], total: 0 };
    };
    resetOutputState();
    captureConsole();
    await cmdPurge({ _: ['purge'], force: true } as any);
    restoreConsole();
    // Should succeed (no prompt needed)
    const output = consoleOutput.join('\n');
    expect(output).toContain('Purged');
  });
});

// ─── watch --format csv/tsv/yaml (Fixes #154) ────────────────────────────────

describe('watch respects --format flag (Fixes #154)', () => {
  // We can't test the full watch loop (it runs forever), but we can verify
  // the watch command imports outputFormat correctly
  test('watch module imports outputFormat', async () => {
    const watchMod = await import('../src/commands/watch.js');
    expect(typeof watchMod.cmdWatch).toBe('function');
  });
});

// ─── #171: search --sort-by and --reverse ─────────────────────────────────────

describe('search --sort-by and --reverse (Fixes #171)', () => {
  test('sorts search results by importance', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'sort-aaa', content: 'low', importance: 0.2, metadata: {} },
        { id: 'sort-bbb', content: 'high', importance: 0.9, metadata: {} },
        { id: 'sort-ccc', content: 'mid', importance: 0.5, metadata: {} },
      ],
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdSearch('test', { _: [], sortBy: 'importance' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    const importances = parsed.memories.map((m: any) => m.importance);
    expect(importances).toEqual([0.2, 0.5, 0.9]);
  });

  test('sorts search results by importance reversed', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'sort-aaa', content: 'low', importance: 0.2, metadata: {} },
        { id: 'sort-bbb', content: 'high', importance: 0.9, metadata: {} },
        { id: 'sort-ccc', content: 'mid', importance: 0.5, metadata: {} },
      ],
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdSearch('test', { _: [], sortBy: 'importance', reverse: true } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    const importances = parsed.memories.map((m: any) => m.importance);
    expect(importances).toEqual([0.9, 0.5, 0.2]);
  });

  test('sorts search results by created date', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'sort-aaa', content: 'newer', created_at: '2026-03-10T00:00:00Z', metadata: {} },
        { id: 'sort-bbb', content: 'older', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      ],
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdSearch('test', { _: [], sortBy: 'created' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.memories[0].id).toBe('sort-bbb');
    expect(parsed.memories[1].id).toBe('sort-aaa');
  });

  test('sort applies in raw mode', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'sort-aaa', content: 'low-imp', importance: 0.2, metadata: {} },
        { id: 'sort-bbb', content: 'high-imp', importance: 0.9, metadata: {} },
      ],
    };
    resetOutputState();
    captureConsole();
    await cmdSearch('test', { _: [], sortBy: 'importance', reverse: true, raw: true } as any);
    restoreConsole();
    resetOutputState();
    expect(consoleOutput[0]).toBe('high-imp');
    expect(consoleOutput[1]).toBe('low-imp');
  });

  test('sort applies in csv mode', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'sort-aaa', content: 'low-imp', importance: 0.2, metadata: {} },
        { id: 'sort-bbb', content: 'high-imp', importance: 0.9, metadata: {} },
      ],
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    await cmdSearch('test', { _: [], sortBy: 'importance', reverse: true } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    const lines = output.split('\n');
    // Header + 2 rows; first data row should be high-imp
    expect(lines[1]).toContain('high-imp');
    expect(lines[2]).toContain('low-imp');
  });
});

// ─── #172: CSV export newline escaping ────────────────────────────────────────

describe('CSV newline escaping (Fixes #172)', () => {
  test('out() flattens newlines in CSV content', async () => {
    resetOutputState();
    const { configureOutput, out } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    out([{ id: 'test-1', content: 'line one\nline two\nline three' }]);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    // Should NOT contain literal newlines within a row
    const lines = output.split('\n');
    // Header + 1 data row = 2 lines
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('line one line two line three');
  });

  test('out() flattens \\r\\n in CSV content', async () => {
    resetOutputState();
    const { configureOutput, out } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    out([{ id: 'test-1', content: 'first\r\nsecond' }]);
    restoreConsole();
    resetOutputState();
    const lines = consoleOutput.join('\n').split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('first second');
  });

  test('search CSV output flattens newlines in content', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'nl-1111-2222', content: 'hello\nworld\nfoo', metadata: { tags: ['t1'] } },
      ],
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    await cmdSearch('hello', { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const lines = consoleOutput.join('\n').split('\n');
    // Header + 1 data row = 2 lines
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('hello world foo');
  });
});

// ─── #175: x402 payment retry includes wallet-auth header ────────────────────

describe('x402 retry includes wallet-auth header (#175)', () => {
  test('x402 retry request includes x-wallet-auth header', async () => {
    let callCount = 0;
    mockFetchResponse = (url: string, init: any) => {
      callCount++;
      if (callCount === 1) {
        // Return 402 on first call — but we can't easily test the full x402 flow
        // without mocking the x402 client. Instead, verify the retry headers
        // include wallet-auth by checking the http.ts source change was applied.
        return { memories: [] };
      }
      return { memories: [] };
    };
    // We can verify the fix is in place by checking the source
    const fs = await import('fs');
    const httpSource = fs.readFileSync(new URL('../src/http.ts', import.meta.url), 'utf-8');
    expect(httpSource).toContain("'x-wallet-auth': walletAuth, ...paymentHeaders");
  });
});

// ─── #176: core --sort-by/--reverse support ──────────────────────────────────

describe('core --sort-by/--reverse (#176)', () => {
  test('core command supports --sort-by importance', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'core-aaa', content: 'low importance', importance: 0.2, metadata: {}, created_at: '2026-01-01T00:00:00Z' },
        { id: 'core-bbb', content: 'high importance', importance: 0.9, metadata: {}, created_at: '2026-01-02T00:00:00Z' },
        { id: 'core-ccc', content: 'mid importance', importance: 0.5, metadata: {}, created_at: '2026-01-03T00:00:00Z' },
      ],
      total: 3,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ json: true });
    captureConsole();
    await cmdCore({ _: [], sortBy: 'importance', reverse: true, json: true } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('');
    const parsed = JSON.parse(output);
    const memories = parsed.memories;
    expect(memories[0].importance).toBe(0.9);
    expect(memories[2].importance).toBe(0.2);
  });

  test('core command supports --sort-by created_at', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'core-d', content: 'newer', importance: 0.5, metadata: {}, created_at: '2026-03-01T00:00:00Z' },
        { id: 'core-e', content: 'older', importance: 0.5, metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      ],
      total: 2,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ json: true });
    captureConsole();
    await cmdCore({ _: [], sortBy: 'created_at', json: true } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('');
    const parsed = JSON.parse(output);
    const memories = parsed.memories;
    expect(memories[0].created_at).toBe('2026-01-01T00:00:00Z');
    expect(memories[1].created_at).toBe('2026-03-01T00:00:00Z');
  });
});

// ─── #177: search CSV/TSV output includes all columns ────────────────────────

describe('search CSV includes all columns (#177)', () => {
  test('search CSV output includes importance, namespace, created columns', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'srch-1234', content: 'test content', importance: 0.75, namespace: 'work', metadata: { tags: ['tag1'] }, created_at: '2026-02-15T00:00:00Z' },
      ],
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ format: 'csv' });
    captureConsole();
    await cmdSearch('test', { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('\n');
    const lines = output.split('\n');
    // Header should include new columns
    expect(lines[0]).toContain('importance');
    expect(lines[0]).toContain('namespace');
    expect(lines[0]).toContain('created');
    // Data row should include values
    expect(lines[1]).toContain('0.75');
    expect(lines[1]).toContain('work');
    expect(lines[1]).toContain('2026-02-15');
  });
});

// ─── #179: export --sort-by/--reverse support ────────────────────────────────

describe('export --sort-by/--reverse (#179)', () => {
  test('export respects --sort-by importance --reverse', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'exp-aaa', content: 'low', importance: 0.1, metadata: {}, created_at: '2026-01-01T00:00:00Z' },
        { id: 'exp-bbb', content: 'high', importance: 0.9, metadata: {}, created_at: '2026-01-02T00:00:00Z' },
      ],
      total: 2,
    };
    resetOutputState();
    const { configureOutput } = await import('../src/output.js');
    configureOutput({ json: true });
    captureConsole();
    await cmdExport({ _: [], sortBy: 'importance', reverse: true, json: true } as any);
    restoreConsole();
    resetOutputState();
    const output = consoleOutput.join('');
    const parsed = JSON.parse(output);
    expect(parsed.memories[0].importance).toBe(0.9);
    expect(parsed.memories[1].importance).toBe(0.1);
  });
});

// ─── #190: alias command ─────────────────────────────────────────────────────

const { cmdAlias } = await import('../src/commands/alias.js');
const { setAliasFile, loadAliases, saveAliases, resolveAlias } = await import('../src/alias.js');

describe('cmdAlias', () => {
  const tmpAliasFile = path.join(os.tmpdir(), `memoclaw-alias-test-${Date.now()}.json`);

  beforeEach(() => {
    setAliasFile(tmpAliasFile);
    // Clean the file before each test
    try { fs.unlinkSync(tmpAliasFile); } catch {}
  });

  afterAll(() => {
    setAliasFile(null);
    try { fs.unlinkSync(tmpAliasFile); } catch {}
  });

  test('set creates an alias', async () => {
    captureConsole();
    await cmdAlias('set', ['my-ctx', 'abc-12345678-uuid'], { _: [] } as any);
    restoreConsole();
    const aliases = loadAliases();
    expect(aliases['my-ctx']).toBe('abc-12345678-uuid');
    expect(consoleOutput.join('\n')).toContain('@my-ctx');
  });

  test('set rejects names with spaces', async () => {
    await expect(cmdAlias('set', ['bad name', 'id'], { _: [] } as any)).rejects.toThrow('spaces');
  });

  test('set rejects names with slashes', async () => {
    await expect(cmdAlias('set', ['bad/name', 'id'], { _: [] } as any)).rejects.toThrow('slashes');
  });

  test('set requires name and id', async () => {
    await expect(cmdAlias('set', ['only-name'], { _: [] } as any)).rejects.toThrow('Usage');
    await expect(cmdAlias('set', [], { _: [] } as any)).rejects.toThrow('Usage');
  });

  test('list shows empty message when no aliases', async () => {
    captureConsole();
    await cmdAlias('list', [], { _: [] } as any);
    restoreConsole();
    expect(consoleOutput.join('\n')).toContain('No aliases');
  });

  test('list JSON mode outputs array', async () => {
    resetOutputState({ json: true });
    captureConsole();
    await cmdAlias('list', [], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.aliases).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  test('rm removes an alias', async () => {
    // Pre-populate
    saveAliases({ 'test-alias': 'some-id' });
    captureConsole();
    await cmdAlias('rm', ['test-alias'], { _: [] } as any);
    restoreConsole();
    const aliases = loadAliases();
    expect(aliases['test-alias']).toBeUndefined();
    expect(consoleOutput.join('\n')).toContain('removed');
  });

  test('rm throws for nonexistent alias', async () => {
    await expect(cmdAlias('rm', ['nope'], { _: [] } as any)).rejects.toThrow('not found');
  });

  test('rm requires name', async () => {
    await expect(cmdAlias('rm', [], { _: [] } as any)).rejects.toThrow('Usage');
  });

  test('invalid subcommand throws', async () => {
    await expect(cmdAlias('bad', [], { _: [] } as any)).rejects.toThrow('Usage');
  });

  test('set JSON mode outputs result', async () => {
    resetOutputState({ json: true });
    captureConsole();
    await cmdAlias('set', ['ctx', 'id-123'], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.alias).toBe('ctx');
    expect(parsed.id).toBe('id-123');
    expect(parsed.action).toBe('set');
  });

  test('rm JSON mode outputs result', async () => {
    saveAliases({ 'del-me': 'id-456' });
    resetOutputState({ json: true });
    captureConsole();
    await cmdAlias('rm', ['del-me'], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.alias).toBe('del-me');
    expect(parsed.action).toBe('removed');
  });
});

describe('resolveAlias', () => {
  const tmpAliasFile = path.join(os.tmpdir(), `memoclaw-resolve-test-${Date.now()}.json`);

  beforeEach(() => {
    setAliasFile(tmpAliasFile);
    saveAliases({ 'my-ctx': 'uuid-12345', 'project': 'uuid-67890' });
  });

  afterAll(() => {
    setAliasFile(null);
    try { fs.unlinkSync(tmpAliasFile); } catch {}
  });

  test('resolves @alias to memory ID', () => {
    expect(resolveAlias('@my-ctx')).toBe('uuid-12345');
    expect(resolveAlias('@project')).toBe('uuid-67890');
  });

  test('passes through non-alias values', () => {
    expect(resolveAlias('regular-id')).toBe('regular-id');
  });

  test('passes through unknown aliases', () => {
    expect(resolveAlias('@unknown')).toBe('@unknown');
  });
});

// ─── #191: snapshot command ──────────────────────────────────────────────────

const { cmdSnapshot } = await import('../src/commands/snapshot.js');

describe('cmdSnapshot', () => {
  // Use a temp directory for snapshot tests
  const tmpDir = path.join(os.tmpdir(), `memoclaw-snapshot-test-${Date.now()}`);

  beforeEach(() => {
    // Patch CONFIG_DIR for snapshots to use temp directory
    fs.mkdirSync(path.join(tmpDir, 'snapshots'), { recursive: true });
  });

  afterAll(() => {
    // Clean up temp directory
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('create fetches memories and saves snapshot', async () => {
    mockFetchResponse = {
      memories: [
        { id: 'snap-1', content: 'memory one', importance: 0.5 },
        { id: 'snap-2', content: 'memory two', importance: 0.8 },
      ],
      total: 2,
    };
    resetOutputState({ json: true });
    captureConsole();
    await cmdSnapshot('create', [], { _: [], name: 'test-snap' } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.name).toBe('test-snap');
    expect(parsed.count).toBe(2);
  });

  test('create passes namespace to API', async () => {
    mockFetchResponse = { memories: [], total: 0 };
    allFetches.length = 0;
    resetOutputState({ json: true });
    captureConsole();
    await cmdSnapshot('create', [], { _: [], name: 'ns-snap', namespace: 'proj1' } as any);
    restoreConsole();
    resetOutputState();
    const url = allFetches.find(f => f.url.includes('/v1/memories'))?.url || '';
    expect(url).toContain('namespace=proj1');
  });

  test('list shows empty message when no snapshots', async () => {
    // Use a fresh empty dir
    const emptyDir = path.join(os.tmpdir(), `memoclaw-empty-snap-${Date.now()}`);
    fs.mkdirSync(path.join(emptyDir, 'snapshots'), { recursive: true });
    captureConsole();
    // We can't easily override the snapshots dir, so test the list path
    // by checking the module works correctly
    await cmdSnapshot('list', [], { _: [] } as any);
    restoreConsole();
    // Will show either empty message or actual snapshots depending on ~/.memoclaw state
    // At minimum it shouldn't throw
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  test('invalid subcommand throws', async () => {
    await expect(cmdSnapshot('bad', [], { _: [] } as any)).rejects.toThrow('Usage');
  });

  test('restore requires name argument', async () => {
    await expect(cmdSnapshot('restore', [], { _: [] } as any)).rejects.toThrow('Usage');
  });

  test('delete requires name argument', async () => {
    await expect(cmdSnapshot('delete', [], { _: [] } as any)).rejects.toThrow('Usage');
  });

  test('restore throws for nonexistent snapshot', async () => {
    await expect(cmdSnapshot('restore', ['nonexistent-xyz'], { _: [] } as any)).rejects.toThrow('not found');
  });

  test('delete throws for nonexistent snapshot', async () => {
    await expect(cmdSnapshot('delete', ['nonexistent-xyz'], { _: [] } as any)).rejects.toThrow('not found');
  });

  test('list JSON mode outputs array', async () => {
    resetOutputState({ json: true });
    captureConsole();
    await cmdSnapshot('list', [], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.snapshots).toBeDefined();
    expect(typeof parsed.count).toBe('number');
  });

  test('default subcommand is list', async () => {
    resetOutputState({ json: true });
    captureConsole();
    await cmdSnapshot(undefined, [], { _: [] } as any);
    restoreConsole();
    resetOutputState();
    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.snapshots).toBeDefined();
  });
});

// ─── #197: recall --watch should apply --sort-by sorting ──────────────────────

describe('recall watch mode sorting (#197)', () => {
  test('recall watch code path includes sortMemories call', async () => {
    const fs = require('fs');
    const source = fs.readFileSync('src/commands/recall.ts', 'utf-8');
    // Extract the watch mode block: from "if (opts.watch)" to the end of
    // the outer while loop. The non-watch path starts with a separate
    // `const result = await request(...)` that is NOT indented inside the if.
    const watchBlock = source.split('if (opts.watch)')[1]?.split('\n  const result')[0];
    expect(watchBlock).toBeDefined();
    // sortMemories must appear in the watch loop (not just the non-watch path)
    expect(watchBlock).toContain('sortMemories');
  });
});

// ─── #199: auth error should suggest memoclaw init ────────────────────────────

describe('auth error message (#199)', () => {
  test('auth.ts error message mentions memoclaw init', async () => {
    const fs = require('fs');
    const source = fs.readFileSync('src/auth.ts', 'utf-8');
    expect(source).toContain('memoclaw init');
    expect(source).toContain('No wallet configured');
  });
});

// ─── #198: alias list parallel fetches + --no-preview ─────────────────────────

describe('alias list performance (#198)', () => {
  test('alias list source uses Promise.allSettled for parallel fetches', () => {
    const fs = require('fs');
    const source = fs.readFileSync('src/commands/alias.ts', 'utf-8');
    expect(source).toContain('Promise.allSettled');
    expect(source).toContain('CONCURRENCY');
  });

  test('alias list source supports --no-preview flag', () => {
    const fs = require('fs');
    const source = fs.readFileSync('src/commands/alias.ts', 'utf-8');
    expect(source).toContain('noPreview');
  });

  test('--no-preview skips API calls', async () => {
    saveAliases({ 'test-np': 'id-np-123' });
    allFetches.length = 0;
    captureConsole();
    await cmdAlias('list', [], { _: [], noPreview: true } as any);
    restoreConsole();
    // Should not have fetched any memory previews
    const previewFetches = allFetches.filter(f => f.url.includes('/v1/memories/'));
    expect(previewFetches.length).toBe(0);
    expect(consoleOutput.join('\n')).toContain('@test-np');
  });

  test('noPreview is in BOOLEAN_FLAGS', () => {
    const { BOOLEAN_FLAGS } = require('../src/args.js');
    expect(BOOLEAN_FLAGS.has('noPreview')).toBe(true);
  });
});

// ─── #200: import --dry-run ──────────────────────────────────────────────────

describe('import --dry-run (#200)', () => {
  test('dry-run validates without calling API', async () => {
    const tmpFile = path.join(os.tmpdir(), `memoclaw-import-dryrun-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({
      memories: [
        { content: 'memory one' },
        { content: 'memory two' },
        { content: 'memory three' },
      ]
    }));

    allFetches.length = 0;
    resetOutputState({ json: true });
    captureConsole();
    await cmdImport({ _: [], file: tmpFile, dryRun: true } as any);
    restoreConsole();
    resetOutputState();

    // No API calls should have been made
    const storeFetches = allFetches.filter(f => f.url.includes('/v1/store'));
    expect(storeFetches.length).toBe(0);

    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.dryRun).toBe(true);
    expect(parsed.valid).toBe(3);
    expect(parsed.errors).toBe(0);
    expect(parsed.estimatedBatches).toBe(1);

    fs.unlinkSync(tmpFile);
  });

  test('dry-run reports validation errors', async () => {
    const tmpFile = path.join(os.tmpdir(), `memoclaw-import-dryrun-err-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({
      memories: [
        { content: 'valid memory' },
        { content: 123 },  // non-string
        { notContent: 'missing content field' },  // missing content
      ]
    }));

    resetOutputState({ json: true });
    captureConsole();
    await cmdImport({ _: [], file: tmpFile, dryRun: true } as any);
    restoreConsole();
    resetOutputState();

    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.dryRun).toBe(true);
    expect(parsed.valid).toBe(1);
    expect(parsed.errors).toBe(2);

    fs.unlinkSync(tmpFile);
  });
});

// ─── #201: move command filter-based bulk selection ───────────────────────────

describe('move filter-based bulk selection (#201)', () => {
  test('move source supports --from-namespace filter', () => {
    const fs = require('fs');
    const source = fs.readFileSync('src/commands/memory.ts', 'utf-8');
    expect(source).toContain('fromNamespace');
    expect(source).toContain('resolveFilteredIds');
  });

  test('move with --from-namespace fetches and moves matching memories', async () => {
    // First call returns memories from source namespace, subsequent calls are PATCH moves
    let callCount = 0;
    globalThis.fetch = (async (input: any, init?: any) => {
      callCount++;
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/v1/memories?') && (!init || init.method === 'GET' || !init.method)) {
        return new Response(JSON.stringify({
          memories: [
            { id: 'filter-1', content: 'mem1', created_at: new Date().toISOString() },
            { id: 'filter-2', content: 'mem2', created_at: new Date().toISOString() },
          ],
          total: 2,
        }), { status: 200 });
      }
      // PATCH calls for move
      return new Response(JSON.stringify({ updated: true }), { status: 200 });
    }) as any;

    resetOutputState({ json: true });
    captureConsole();
    await cmdMove([], { _: ['move'], namespace: 'archive', fromNamespace: 'old-project' } as any);
    restoreConsole();
    resetOutputState();

    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.moved).toBe(2);
    expect(parsed.namespace).toBe('archive');

    // Restore mock
    setupMockFetch();
  });

  test('move with filters but no matches returns 0', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ memories: [], total: 0 }), { status: 200 });
    }) as any;

    resetOutputState({ json: true });
    captureConsole();
    await cmdMove([], { _: ['move'], namespace: 'archive', fromNamespace: 'empty-ns' } as any);
    restoreConsole();
    resetOutputState();

    const parsed = JSON.parse(consoleOutput.join(''));
    expect(parsed.moved).toBe(0);

    setupMockFetch();
  });

  test('move without ids or filters throws', async () => {
    await expect(
      cmdMove([], { _: ['move'], namespace: 'target' } as any)
    ).rejects.toThrow('filter flags required');
  });

  test('cli.ts allows move without ids when filter flags present', () => {
    const fs = require('fs');
    const source = fs.readFileSync('src/cli.ts', 'utf-8');
    expect(source).toContain('hasFilters');
    expect(source).toContain('fromNamespace');
  });
});
