/**
 * Watch command: stream new memories in real-time via polling.
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputFormat, out, outputWrite, table } from '../output.js';
import { sortMemories } from './list.js';

export async function cmdWatch(opts: ParsedArgs) {
  const intervalSeconds = Number(opts.interval ?? '3');
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) {
    throw new Error('Invalid --interval value. Must be a number >= 1 second.');
  }
  const interval = intervalSeconds * 1000;
  const params = new URLSearchParams();
  params.set('sort', 'created_at');
  params.set('order', 'desc');
  params.set('limit', '20');

  if (opts.namespace) params.set('namespace', opts.namespace);
  if (opts.tags) params.set('tags', opts.tags);

  let lastSeenTimestamp: string | null = null;
  let running = true;

  const cleanup = () => { running = false; };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  if (!outputJson) {
    outputWrite(`${c.dim}Watching for new memories... Press Ctrl+C to stop.${c.reset}`);
    if (opts.namespace) outputWrite(`${c.dim}Namespace: ${opts.namespace}${c.reset}`);
    if (opts.tags) outputWrite(`${c.dim}Tags: ${opts.tags}${c.reset}`);
    outputWrite('');
  }

  while (running) {
    try {
      const result = await request('GET', `/v1/memories?${params}`) as any;
      const memories = result.memories || result.data || [];

      // Filter to only new memories
      let newMemories = memories;
      if (lastSeenTimestamp) {
        newMemories = memories.filter((m: any) =>
          m.created_at && m.created_at > lastSeenTimestamp!
        );
      }

      if (newMemories.length > 0) {
        // Update last-seen to the newest
        lastSeenTimestamp = newMemories[0].created_at || lastSeenTimestamp;

        // Apply user sorting if specified, otherwise chronological (newest-last)
        const sorted = (opts.sortBy) ? sortMemories([...newMemories], opts) : [...newMemories].reverse();

        for (const mem of sorted) {
          if (outputJson) {
            // JSON lines output
            outputWrite(JSON.stringify(mem));
          } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
            const rows = [{
              id: mem.id || '',
              content: (mem.content || '').replace(/\n/g, ' '),
              importance: mem.importance?.toFixed(2) || '',
              namespace: mem.namespace || '',
              tags: mem.metadata?.tags?.join(', ') || '',
              created: mem.created_at || '',
            }];
            out(rows);
          } else {
            const ts = mem.created_at ? new Date(mem.created_at).toLocaleTimeString() : '';
            const imp = mem.importance !== undefined ? ` ${c.dim}imp:${mem.importance}${c.reset}` : '';
            const tags = mem.metadata?.tags?.length ? ` ${c.dim}[${mem.metadata.tags.join(', ')}]${c.reset}` : '';
            const ns = mem.namespace ? ` ${c.dim}(${mem.namespace})${c.reset}` : '';
            const id = mem.id ? `${c.cyan}${mem.id.slice(0, 8)}…${c.reset}` : '';
            const content = (mem.content || '').slice(0, 120).replace(/\n/g, ' ');
            outputWrite(`${c.dim}${ts}${c.reset} ${id}${ns}${imp}${tags} ${content}`);
          }
        }
      }

      // On first poll, set the timestamp even if no new memories
      if (!lastSeenTimestamp && memories.length > 0) {
        lastSeenTimestamp = memories[0].created_at;
      }
    } catch (err: any) {
      if (!running) break;
      if (!outputJson) {
        outputWrite(`${c.red}Poll error:${c.reset} ${err.message}`);
      }
    }

    // Wait for next poll
    if (running) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  process.removeListener('SIGINT', cleanup);
  process.removeListener('SIGTERM', cleanup);

  if (!outputJson) {
    outputWrite(`\n${c.dim}Stopped watching.${c.reset}`);
  }
}
