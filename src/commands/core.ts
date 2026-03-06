/**
 * Core memories command — list core memories (FREE endpoint)
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputFormat, outputTruncate, noTruncate, out, table, outputWrite } from '../output.js';

export async function cmdCore(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.limit != null && opts.limit !== true) params.set('limit', opts.limit);
  if (opts.namespace) params.set('namespace', opts.namespace);

  const result = await request('GET', `/v1/core?${params}`) as any;

  if (outputJson) {
    out(result);
    return;
  }

  if (opts.raw) {
    const memories = result.memories || result.core_memories || result.data || [];
    for (const mem of memories) {
      outputWrite(mem.content || '');
    }
    return;
  }

  const memories = result.memories || result.core_memories || result.data || [];

  if (memories.length === 0) {
    console.log(`${c.dim}No core memories found.${c.reset}`);
    return;
  }

  if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    const rows = memories.map((m: any) => ({
      id: m.id || '',
      content: m.content || '',
      importance: m.importance?.toFixed(2) || '',
      tags: m.metadata?.tags?.join(', ') || '',
      created: m.created_at || '',
    }));
    out(rows);
    return;
  }

  const truncateWidth = noTruncate ? Infinity : (outputTruncate || 60);
  const rows = memories.map((m: any) => ({
    id: m.id?.slice(0, 8) || '?',
    content: m.content?.length > truncateWidth ? m.content.slice(0, truncateWidth - 1) + '…' : (m.content || ''),
    importance: m.importance != null ? m.importance.toFixed(2) : '-',
    tags: m.metadata?.tags?.join(', ') || '',
    created: m.created_at ? new Date(m.created_at).toLocaleDateString() : '',
  }));

  table(rows, [
    { key: 'id', label: 'ID', width: 10 },
    { key: 'content', label: 'CONTENT', width: noTruncate ? 200 : (outputTruncate || 62) },
    { key: 'importance', label: 'IMP', width: 5 },
    { key: 'tags', label: 'TAGS', width: 20 },
    { key: 'created', label: 'CREATED', width: 12 },
  ]);

  const total = result.total ?? memories.length;
  console.log(`${c.dim}─ ${memories.length} of ${total} core memories${c.reset}`);
}
