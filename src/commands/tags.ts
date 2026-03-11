import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputFormat, out, outputWrite, table } from '../output.js';

/** Fetch all unique tags (with counts) by paginating through memories */
async function fetchAllTags(opts: ParsedArgs): Promise<{ tag: string; count: number }[]> {
  const tagCounts = new Map<string, number>();
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
        if (tag && typeof tag === 'string') {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }
    if (memories.length < pageSize) break;
    offset += pageSize;
  }

  return [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

export async function cmdTags(subcmd: string, rest: string[], opts: ParsedArgs) {
  if (subcmd === 'list' || !subcmd) {
    const tagData = await fetchAllTags(opts);

    if (outputJson) {
      out({ tags: tagData.map(t => ({ tag: t.tag, count: t.count })), count: tagData.length });
    } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
      out(tagData.map(t => ({ tag: t.tag, count: t.count })));
    } else if (tagData.length === 0) {
      outputWrite(`${c.dim}No tags found.${c.reset}`);
    } else {
      table(tagData.map(t => ({ tag: t.tag, count: String(t.count) })), [
        { key: 'tag', label: 'TAG', width: 30 },
        { key: 'count', label: 'COUNT', width: 8 },
      ]);
      outputWrite(`${c.dim}─ ${tagData.length} tag${tagData.length !== 1 ? 's' : ''}${c.reset}`);
    }
  } else {
    throw new Error('Usage: tags [list]');
  }
}
