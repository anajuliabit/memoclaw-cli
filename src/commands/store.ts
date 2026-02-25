import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, success, info } from '../output.js';
import { validateContentLength, validateImportance } from '../validate.js';

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
