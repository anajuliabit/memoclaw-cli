/**
 * Core memories command — list core memories (FREE endpoint)
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputFormat, outputTruncate, noTruncate, out, table, outputWrite } from '../output.js';
import { parseDate, filterByDateRange, overfetchLimit } from '../dates.js';
import { sortMemories } from './list.js';

export async function cmdCore(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.namespace) params.set('namespace', opts.namespace);

  // Parse --since / --until date filters
  const sinceDate = opts.since ? parseDate(opts.since) : null;
  const untilDate = opts.until ? parseDate(opts.until) : null;
  if ((opts.since && !sinceDate) || (opts.until && !untilDate)) {
    throw new Error(
      `Invalid date format. Use ISO 8601 (2025-01-01) or relative shorthand (1h, 7d, 2w, 1mo, 1y).`
    );
  }

  const hasDateFilter = !!(sinceDate || untilDate);
  const userLimit = opts.limit != null && opts.limit !== true ? Number(opts.limit) : undefined;

  if (hasDateFilter) {
    // Over-fetch when date-filtering client-side
    params.set('limit', String(overfetchLimit(userLimit)));
  } else if (userLimit != null) {
    params.set('limit', String(userLimit));
  }

  const result = await request('GET', `/v1/core?${params}`) as any;

  if (outputJson) {
    let data = result;
    if (hasDateFilter) {
      let items = result.memories || result.core_memories || result.data || [];
      items = filterByDateRange(items, 'created_at', sinceDate, untilDate);
      items = sortMemories(items, opts);
      data = { ...result, memories: items, total: items.length };
    } else {
      let items = result.memories || result.core_memories || result.data || [];
      items = sortMemories(items, opts);
      data = { ...result, memories: items };
    }
    out(data);
    return;
  }

  if (opts.raw) {
    let memories = result.memories || result.core_memories || result.data || [];
    memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
    memories = sortMemories(memories, opts);
    for (const mem of memories) {
      outputWrite(mem.content || '');
    }
    return;
  }

  let memories = result.memories || result.core_memories || result.data || [];
  memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
  memories = sortMemories(memories, opts);

  if (userLimit != null && hasDateFilter) {
    memories = memories.slice(0, userLimit);
  }

  if (memories.length === 0) {
    outputWrite(`${c.dim}No core memories found.${c.reset}`);
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
  outputWrite(`${c.dim}─ ${memories.length} of ${total} core memories${c.reset}`);
}
