import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputQuiet, out, success, info, progressBar } from '../output.js';
import { validateContentLength, validateImportance } from '../validate.js';

export async function cmdStoreBatch(opts: ParsedArgs, lines: string[]) {
  if (lines.length === 0) throw new Error('No input. Pipe content via stdin (one memory per line, or JSON array).');

  // Try parsing as JSON array first
  let memories: { content: string; [k: string]: any }[];
  const joined = lines.join('\n').trim();
  if (joined.startsWith('[')) {
    try {
      const parsed = JSON.parse(joined);
      if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
      memories = parsed.map((item: any) => {
        if (typeof item === 'string') return { content: item };
        if (typeof item === 'object' && item.content) return item;
        throw new Error('Each array element must be a string or object with "content" field');
      });
    } catch (e: any) {
      throw new Error(`Invalid JSON array: ${e.message}`);
    }
  } else {
    // One memory per line
    memories = lines.filter(l => l.trim()).map(l => ({ content: l.trim() }));
  }

  if (memories.length === 0) throw new Error('No memories to store');

  // Apply shared opts to each memory
  for (const mem of memories) {
    validateContentLength(mem.content);
    if (opts.importance != null && opts.importance !== true && mem.importance === undefined)
      mem.importance = validateImportance(opts.importance);
    if (opts.tags && !mem.metadata)
      mem.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
    if (opts.namespace && !mem.namespace) mem.namespace = opts.namespace;
    if (opts.memoryType && !mem.memory_type) mem.memory_type = opts.memoryType;
    if (opts.immutable && mem.immutable === undefined) mem.immutable = true;
    if (opts.pinned && mem.pinned === undefined) mem.pinned = true;
  }

  // Batch in chunks of 100
  const BATCH_SIZE = 100;
  let stored = 0;

  for (let i = 0; i < memories.length; i += BATCH_SIZE) {
    const chunk = memories.slice(i, i + BATCH_SIZE);
    const result = await request('POST', '/v1/store/batch', { memories: chunk }) as any;
    stored += result.stored ?? chunk.length;
    if (!outputQuiet) {
      process.stderr.write(`\r  ${progressBar(Math.min(i + BATCH_SIZE, memories.length), memories.length)}`);
    }
  }

  if (!outputQuiet) process.stderr.write('\n');

  if (outputJson) {
    out({ stored, total: memories.length });
  } else {
    success(`Stored ${c.cyan}${stored}${c.reset} memories via batch`);
  }
}

export async function cmdStore(content: string, opts: ParsedArgs) {
  validateContentLength(content);
  const body: Record<string, any> = { content };
  if (opts.importance != null && opts.importance !== true) body.importance = validateImportance(opts.importance);
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.memoryType) body.memory_type = opts.memoryType;
  if (opts.immutable) body.immutable = true;
  if (opts.pinned) body.pinned = true;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;
  if (opts.expiresAt) body.expires_at = opts.expiresAt;

  const result = await request('POST', '/v1/store', body);
  if (outputJson) {
    out(result);
  } else {
    success(`Memory stored${result.id ? ` (${c.cyan}${result.id}${c.reset})` : ''}`);
    if (result.importance !== undefined) info(`Importance: ${result.importance}`);
  }
}
