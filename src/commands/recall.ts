import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputTruncate, outputFormat, out, outputWrite, truncate } from '../output.js';

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

  // Watch mode
  if (opts.watch) {
    let lastFingerprint = '';
    const pollInterval = parseInt(opts.watchInterval || '5000');

    outputWrite(`${c.dim}Watching for changes... Press Ctrl+C to stop.${c.reset}`);

    while (true) {
      try {
        const result = await request('POST', '/v1/recall', body) as any;
        const memories = result.memories || [];
        const fingerprint = memories.map((m: any) => `${m.id}:${m.updated_at || ''}`).join('|');

        if (fingerprint !== lastFingerprint) {
          if (lastFingerprint) outputWrite(`${c.dim}${'─'.repeat(40)}${c.reset}`);
          lastFingerprint = fingerprint;
          renderMemories(memories);
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
    out(result);
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    const memories = result.memories || [];
    const rows = memories.map((m: any) => ({
      id: m.id || '',
      similarity: m.similarity?.toFixed(3) || '',
      content: m.content || '',
      importance: m.importance?.toFixed(2) || '',
      tags: m.metadata?.tags?.join(', ') || '',
    }));
    out(rows);
  } else if (opts.raw) {
    const memories = result.memories || [];
    for (const mem of memories) {
      outputWrite(mem.content);
    }
  } else {
    renderMemories(result.memories || [], { showId: true });
  }
}
