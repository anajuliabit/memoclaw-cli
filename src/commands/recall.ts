import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputTruncate, outputFormat, out, outputWrite, truncate } from '../output.js';
import { parseDate, filterByDateRange, overfetchLimit } from '../dates.js';
import { sortMemories } from './list.js';

/** Render a list of recall memories to stdout (shared between normal and watch mode) */
function renderMemories(memories: any[], opts: { showId?: boolean } = {}) {
  if (memories.length === 0) {
    outputWrite(`${c.dim}No memories found.${c.reset}`);
    return;
  }
  for (const mem of memories) {
    const sim = mem.similarity?.toFixed(3) || '???';
    const simColor = (mem.similarity || 0) > 0.8 ? c.green : (mem.similarity || 0) > 0.5 ? c.yellow : c.red;
    const content = outputTruncate ? truncate(mem.content, outputTruncate) : mem.content;
    outputWrite(`${simColor}[${sim}]${c.reset} ${content}`);
    if (mem.metadata?.tags?.length) {
      outputWrite(`  ${c.dim}tags: ${mem.metadata.tags.join(', ')}${c.reset}`);
    }
    if (opts.showId && mem.id) {
      outputWrite(`  ${c.dim}id: ${mem.id}${c.reset}`);
    }
  }
  outputWrite(`${c.dim}─ ${memories.length} result${memories.length !== 1 ? 's' : ''}${c.reset}`);
}

export async function cmdRecall(query: string, opts: ParsedArgs) {
  const body: Record<string, any> = { query };
  if (opts.limit != null && opts.limit !== true) body.limit = parseInt(opts.limit);
  if (opts.minSimilarity != null && opts.minSimilarity !== true) body.min_similarity = parseFloat(opts.minSimilarity);
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.filters = { tags: opts.tags.split(',').map((t: string) => t.trim()) };

  // Parse date filters
  const sinceDate = opts.since ? parseDate(opts.since) : null;
  const untilDate = opts.until ? parseDate(opts.until) : null;
  if ((opts.since && !sinceDate) || (opts.until && !untilDate)) {
    throw new Error(
      `Invalid date format. Use ISO 8601 (2025-01-01) or relative shorthand (1h, 7d, 2w, 1mo, 1y).`
    );
  }

  // Over-fetch when date filters are active (#140)
  const hasDateFilter = !!(sinceDate || untilDate);
  const userLimit = body.limit;
  if (hasDateFilter) {
    body.limit = overfetchLimit(userLimit);
    if (sinceDate) body.since = sinceDate.toISOString();
    if (untilDate) body.until = untilDate.toISOString();
  }
  const trimLimit = hasDateFilter && userLimit ? userLimit : undefined;

  // Watch mode
  if (opts.watch) {
    let lastFingerprint = '';
    const pollInterval = parseInt(opts.watchInterval || '5000');
    const watchTrimLimit = hasDateFilter && userLimit ? userLimit : undefined;

    outputWrite(`${c.dim}Watching for changes... Press Ctrl+C to stop.${c.reset}`);

    while (true) {
      try {
        const result = await request('POST', '/v1/recall', body) as any;
        let memories = result.memories || [];
        memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
        if (watchTrimLimit) memories = memories.slice(0, watchTrimLimit);
        const fingerprint = memories.map((m: any) => `${m.id}:${m.updated_at || ''}`).join('|');

        if (fingerprint !== lastFingerprint) {
          if (lastFingerprint) outputWrite(`${c.dim}${'─'.repeat(40)}${c.reset}`);
          lastFingerprint = fingerprint;

          if (outputJson) {
            out(result);
          } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
            const rows = memories.map((m: any) => ({
              id: m.id || '',
              similarity: m.similarity?.toFixed(3) || '',
              content: m.content || '',
              importance: m.importance?.toFixed(2) || '',
              namespace: m.namespace || '',
              tags: m.metadata?.tags?.join(', ') || '',
              created: m.created_at || '',
            }));
            out(rows);
          } else if (opts.raw) {
            for (const mem of memories) {
              outputWrite(mem.content);
            }
          } else {
            renderMemories(memories, { showId: true });
          }
        }

        await new Promise(r => setTimeout(r, pollInterval));
      } catch (e) {
        if (process.env.DEBUG) console.error('Watch error:', e);
        await new Promise(r => setTimeout(r, pollInterval));
      }
    }
  }

  const result = await request('POST', '/v1/recall', body) as any;

  if (outputJson) {
    if (hasDateFilter) {
      let filtered = filterByDateRange(result.memories || [], 'created_at', sinceDate, untilDate);
      filtered = sortMemories(filtered, opts);
      if (trimLimit) filtered = filtered.slice(0, trimLimit);
      out({ ...result, memories: filtered });
    } else {
      let memories = sortMemories(result.memories || [], opts);
      out({ ...result, memories });
    }
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    let memories = result.memories || [];
    memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
    memories = sortMemories(memories, opts);
    if (trimLimit) memories = memories.slice(0, trimLimit);
    const rows = memories.map((m: any) => ({
      id: m.id || '',
      similarity: m.similarity?.toFixed(3) || '',
      content: m.content || '',
      importance: m.importance?.toFixed(2) || '',
      namespace: m.namespace || '',
      tags: m.metadata?.tags?.join(', ') || '',
      created: m.created_at || '',
    }));
    out(rows);
  } else if (opts.raw) {
    let memories = result.memories || [];
    memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
    memories = sortMemories(memories, opts);
    if (trimLimit) memories = memories.slice(0, trimLimit);
    for (const mem of memories) {
      outputWrite(mem.content);
    }
  } else {
    let memories = result.memories || [];
    memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
    memories = sortMemories(memories, opts);
    if (trimLimit) memories = memories.slice(0, trimLimit);
    renderMemories(memories, { showId: true });
  }
}
