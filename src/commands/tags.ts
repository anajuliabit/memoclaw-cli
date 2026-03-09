import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputFormat, out, outputWrite, table } from '../output.js';

/** Fetch all unique tags by paginating through memories */
async function fetchAllTags(opts: ParsedArgs): Promise<string[]> {
  const tagSet = new Set<string>();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (opts.namespace) params.set('namespace', opts.namespace);
    const result = await request('GET', `/v1/memories?${params}`) as any;
    const memories = result.memories || result.data || [];
    for (const mem of memories) {
      const tags = mem.metadata?.tags || [];
      for (const tag of tags) {
        if (tag && typeof tag === 'string') tagSet.add(tag);
      }
    }
    if (memories.length < pageSize) break;
    offset += pageSize;
  }

  return [...tagSet].sort((a, b) => a.localeCompare(b));
}

export async function cmdTags(subcmd: string, rest: string[], opts: ParsedArgs) {
  if (subcmd === 'list' || !subcmd) {
    const tags = await fetchAllTags(opts);

    if (outputJson) {
      out({ tags, count: tags.length });
    } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
      out(tags.map(tag => ({ tag })));
    } else if (tags.length === 0) {
      outputWrite(`${c.dim}No tags found.${c.reset}`);
    } else {
      table(tags.map(tag => ({ tag })), [{ key: 'tag', label: 'TAG', width: 30 }]);
      outputWrite(`${c.dim}─ ${tags.length} tag${tags.length !== 1 ? 's' : ''}${c.reset}`);
    }
  } else {
    throw new Error('Usage: tags [list]');
  }
}
