/**
 * Single-memory commands: get, delete, update
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputFormat, out, outputWrite, success, readStdin } from '../output.js';
import { MAX_CONTENT_LENGTH, validateContentLength, validateImportance, warnIfBooleanImportance } from '../validate.js';
import { readFileContent } from './store.js';

export async function cmdGet(id: string, opts?: ParsedArgs) {
  const result = await request('GET', `/v1/memories/${id}`) as any;
  if (outputJson) {
    out(result);
  } else if (opts?.raw) {
    const mem = result.memory || result;
    outputWrite(mem.content);
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    const mem = result.memory || result;
    const row = {
      id: mem.id || id,
      content: mem.content || '',
      importance: mem.importance?.toFixed(2) || '',
      namespace: mem.namespace || '',
      tags: mem.metadata?.tags?.join(', ') || '',
      type: mem.memory_type || '',
      created: mem.created_at || '',
      updated: mem.updated_at || '',
      immutable: mem.immutable ? 'yes' : '',
      pinned: mem.pinned ? 'yes' : '',
    };
    out([row]);
  } else {
    const mem = result.memory || result;
    outputWrite(`${c.bold}ID:${c.reset}         ${mem.id || id}`);
    outputWrite(`${c.bold}Content:${c.reset}    ${mem.content}`);
    if (mem.importance !== undefined) outputWrite(`${c.bold}Importance:${c.reset} ${mem.importance}`);
    if (mem.namespace) outputWrite(`${c.bold}Namespace:${c.reset}  ${mem.namespace}`);
    if (mem.metadata?.tags?.length) outputWrite(`${c.bold}Tags:${c.reset}       ${mem.metadata.tags.join(', ')}`);
    if (mem.memory_type) outputWrite(`${c.bold}Type:${c.reset}       ${mem.memory_type}`);
    if (mem.created_at) outputWrite(`${c.bold}Created:${c.reset}    ${new Date(mem.created_at).toLocaleString()}`);
    if (mem.updated_at) outputWrite(`${c.bold}Updated:${c.reset}    ${new Date(mem.updated_at).toLocaleString()}`);
    if (mem.immutable) outputWrite(`${c.bold}Immutable:${c.reset}  ${c.yellow}yes${c.reset}`);
    if (mem.pinned) outputWrite(`${c.bold}Pinned:${c.reset}     ${c.green}yes${c.reset}`);
    if (mem.expires_at) outputWrite(`${c.bold}Expires:${c.reset}    ${new Date(mem.expires_at).toLocaleString()}`);
    if (mem.session_id) outputWrite(`${c.bold}Session:${c.reset}    ${mem.session_id}`);
    if (mem.agent_id) outputWrite(`${c.bold}Agent:${c.reset}      ${mem.agent_id}`);
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

export async function cmdBulkDelete(ids: string[], opts: ParsedArgs) {
  const result = await request('POST', '/v1/memories/bulk-delete', { ids }) as any;
  if (outputJson) {
    out(result);
  } else {
    const deleted = result.deleted ?? ids.length;
    success(`Deleted ${c.cyan}${deleted}${c.reset} memories`);
  }
}

export async function cmdUpdate(id: string, opts: ParsedArgs) {
  const body: Record<string, any> = {};
  let content = opts.content && opts.content !== true ? String(opts.content) : undefined;
  if (!content && opts.file) {
    content = readFileContent(opts.file);
  }
  if (!content) {
    const stdin = await readStdin();
    if (stdin) content = stdin;
  }
  if (content) {
    validateContentLength(content);
    body.content = content;
  }
  if (opts.importance != null && !warnIfBooleanImportance(opts.importance)) {
    body.importance = validateImportance(opts.importance);
  }
  if (opts.memoryType) body.memory_type = opts.memoryType;
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.expiresAt) body.expires_at = opts.expiresAt;
  if (opts.pinned !== undefined) body.pinned = opts.pinned === 'true' || opts.pinned === true;
  if (opts.immutable !== undefined) body.immutable = opts.immutable === 'true' || opts.immutable === true;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;

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
