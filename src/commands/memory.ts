/**
 * Single-memory commands: get, delete, update
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, success, readStdin } from '../output.js';
import { MAX_CONTENT_LENGTH, validateImportance } from '../validate.js';

export async function cmdGet(id: string) {
  const result = await request('GET', `/v1/memories/${id}`) as any;
  if (outputJson) {
    out(result);
  } else {
    const mem = result.memory || result;
    console.log(`${c.bold}ID:${c.reset}         ${mem.id || id}`);
    console.log(`${c.bold}Content:${c.reset}    ${mem.content}`);
    if (mem.importance !== undefined) console.log(`${c.bold}Importance:${c.reset} ${mem.importance}`);
    if (mem.namespace) console.log(`${c.bold}Namespace:${c.reset}  ${mem.namespace}`);
    if (mem.metadata?.tags?.length) console.log(`${c.bold}Tags:${c.reset}       ${mem.metadata.tags.join(', ')}`);
    if (mem.memory_type) console.log(`${c.bold}Type:${c.reset}       ${mem.memory_type}`);
    if (mem.created_at) console.log(`${c.bold}Created:${c.reset}    ${new Date(mem.created_at).toLocaleString()}`);
    if (mem.updated_at) console.log(`${c.bold}Updated:${c.reset}    ${new Date(mem.updated_at).toLocaleString()}`);
    if (mem.immutable) console.log(`${c.bold}Immutable:${c.reset}  ${c.yellow}yes${c.reset}`);
    if (mem.pinned) console.log(`${c.bold}Pinned:${c.reset}     ${c.green}yes${c.reset}`);
  }
}

export async function cmdDelete(id: string) {
  const result = await request('DELETE', `/v1/memories/${id}`);
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} deleted`);
  }
}

export async function cmdUpdate(id: string, opts: ParsedArgs) {
  const body: Record<string, any> = {};
  let content = opts.content && opts.content !== true ? String(opts.content) : undefined;
  if (!content) {
    const stdin = await readStdin();
    if (stdin) content = stdin;
  }
  if (content) {
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Content exceeds the ${MAX_CONTENT_LENGTH} character limit (got ${content.length} chars)`);
    }
    body.content = content;
  }
  if (opts.importance != null && opts.importance !== true) {
    body.importance = validateImportance(opts.importance);
  }
  if (opts.memoryType) body.memory_type = opts.memoryType;
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.expiresAt) body.expires_at = opts.expiresAt;
  if (opts.pinned !== undefined) body.pinned = opts.pinned === 'true' || opts.pinned === true;

  if (Object.keys(body).length === 0) {
    throw new Error('No fields to update. Use --content, --importance, --tags, etc.');
  }

  const result = await request('PATCH', `/v1/memories/${id}`, body);
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} updated`);
  }
}
