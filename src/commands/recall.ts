import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputTruncate, outputFormat, out, truncate } from '../output.js';

export async function cmdRecall(query: string, opts: ParsedArgs) {
  const body: Record<string, any> = { query };
  if (opts.limit != null && opts.limit !== true) body.limit = parseInt(opts.limit);
  if (opts.minSimilarity != null && opts.minSimilarity !== true) body.min_similarity = parseFloat(opts.minSimilarity);
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.filters = { tags: opts.tags.split(',').map((t: string) => t.trim()) };

  // Watch mode
  if (opts.watch) {
    let lastCount = -1;
    const pollInterval = parseInt(opts.watchInterval || '5000');

    console.log(`${c.dim}Watching for changes... Press Ctrl+C to stop.${c.reset}`);

    while (true) {
      try {
        const result = await request('POST', '/v1/recall', body) as any;
        const memories = result.memories || [];

        if (memories.length !== lastCount) {
          if (lastCount >= 0) console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
          lastCount = memories.length;

          if (memories.length === 0) {
            console.log(`${c.dim}No memories found.${c.reset}`);
          } else {
            for (const mem of memories) {
              const sim = mem.similarity?.toFixed(3) || '???';
              const simColor = (mem.similarity || 0) > 0.8 ? c.green : (mem.similarity || 0) > 0.5 ? c.yellow : c.red;
              const content = outputTruncate ? truncate(mem.content, outputTruncate) : mem.content;
              console.log(`${simColor}[${sim}]${c.reset} ${content}`);
              if (mem.metadata?.tags?.length) {
                console.log(`  ${c.dim}tags: ${mem.metadata.tags.join(', ')}${c.reset}`);
              }
            }
            console.log(`${c.dim}─ ${memories.length} result${memories.length !== 1 ? 's' : ''}${c.reset}`);
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
      console.log(mem.content);
    }
  } else {
    const memories = result.memories || [];
    if (memories.length === 0) {
      console.log(`${c.dim}No memories found.${c.reset}`);
    } else {
      for (const mem of memories) {
        const sim = mem.similarity?.toFixed(3) || '???';
        const simColor = (mem.similarity || 0) > 0.8 ? c.green : (mem.similarity || 0) > 0.5 ? c.yellow : c.red;
        const content = outputTruncate ? truncate(mem.content, outputTruncate) : mem.content;
        console.log(`${simColor}[${sim}]${c.reset} ${content}`);
        if (mem.metadata?.tags?.length) {
          console.log(`  ${c.dim}tags: ${mem.metadata.tags.join(', ')}${c.reset}`);
        }
        if (mem.id) {
          console.log(`  ${c.dim}id: ${mem.id}${c.reset}`);
        }
      }
      console.log(`${c.dim}─ ${memories.length} result${memories.length !== 1 ? 's' : ''}${c.reset}`);
    }
  }
}
