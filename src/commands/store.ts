import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, success, info } from '../output.js';

export async function cmdStore(content: string, opts: ParsedArgs) {
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
