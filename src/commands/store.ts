import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, success, info } from '../output.js';

const MAX_CONTENT_LENGTH = 8192;

function validateContentLength(content: string, label = 'Content') {
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`${label} exceeds the ${MAX_CONTENT_LENGTH} character limit (got ${content.length} chars)`);
  }
}

export async function cmdStore(content: string, opts: ParsedArgs) {
  validateContentLength(content);
  const body: Record<string, any> = { content };
  if (opts.importance != null && opts.importance !== true) body.importance = parseFloat(opts.importance);
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.namespace) body.namespace = opts.namespace;

  const result = await request('POST', '/v1/store', body);
  if (outputJson) {
    out(result);
  } else {
    success(`Memory stored${result.id ? ` (${c.cyan}${result.id}${c.reset})` : ''}`);
    if (result.importance !== undefined) info(`Importance: ${result.importance}`);
  }
}
