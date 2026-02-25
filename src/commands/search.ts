/**
 * Search, context, extract, ingest, consolidate commands
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputTruncate, noTruncate, out, success, info, truncate, readStdin } from '../output.js';

export async function cmdSearch(query: string, opts: ParsedArgs) {
  const params = new URLSearchParams({ q: query });
  if (opts.limit != null && opts.limit !== true) params.set('limit', opts.limit);
  if (opts.namespace) params.set('namespace', opts.namespace);
  if (opts.tags) params.set('tags', opts.tags);

  const result = await request('GET', `/v1/memories/search?${params}`) as any;

  if (outputJson) {
    out(result);
  } else if (opts.raw) {
    const memories = result.memories || result.data || [];
    for (const mem of memories) {
      console.log(mem.content);
    }
  } else {
    const memories = result.memories || result.data || [];
    if (memories.length === 0) {
      console.log(`${c.dim}No memories found.${c.reset}`);
    } else {
      const truncateWidth = outputTruncate || 80;
      for (const mem of memories) {
        const content = noTruncate ? mem.content : truncate(mem.content || '', truncateWidth);
        console.log(`${c.cyan}${(mem.id || '?').slice(0, 8)}${c.reset}  ${content}`);
        if (mem.metadata?.tags?.length) {
          console.log(`  ${c.dim}tags: ${mem.metadata.tags.join(', ')}${c.reset}`);
        }
      }
      console.log(`${c.dim}─ ${memories.length} result${memories.length !== 1 ? 's' : ''} (text search, free)${c.reset}`);
    }
  }
}

export async function cmdContext(query: string, opts: ParsedArgs) {
  const body: Record<string, any> = { query };
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.limit != null && opts.limit !== true) body.limit = parseInt(opts.limit);

  const result = await request('POST', '/v1/context', body) as any;

  if (outputJson) {
    out(result);
  } else {
    const context = result.context || result.text || result.content;
    if (context) {
      console.log(context);
    } else {
      out(result);
    }
  }
}

export async function cmdExtract(text: string, opts: ParsedArgs) {
  const body: Record<string, any> = { text };
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;

  const result = await request('POST', '/v1/memories/extract', body);
  out(result);
}

export async function cmdIngest(opts: ParsedArgs) {
  const body: Record<string, any> = {};
  if (opts.text) body.text = opts.text;
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;
  if (opts.autoRelate !== undefined) body.auto_relate = opts.autoRelate !== 'false';
  else body.auto_relate = true;

  if (!body.text && opts.file) {
    const fs = await import('fs');
    if (!fs.existsSync(opts.file)) throw new Error(`File not found: ${opts.file}`);
    body.text = fs.readFileSync(opts.file, 'utf-8');
  }

  if (!body.text) {
    const stdin = await readStdin();
    if (stdin) body.text = stdin;
  }

  if (!body.text) throw new Error('Text required (use --text, --file, or pipe via stdin)');

  const result = await request('POST', '/v1/ingest', body) as any;
  if (outputJson) {
    out(result);
  } else {
    const count = result.memories_created ?? result.count ?? '?';
    success(`Ingested text → ${count} memories created`);
  }
}

export async function cmdConsolidate(opts: ParsedArgs) {
  const body: Record<string, any> = {};
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.minSimilarity != null && opts.minSimilarity !== true) body.min_similarity = parseFloat(opts.minSimilarity);
  if (opts.mode) body.mode = opts.mode;
  if (opts.dryRun !== undefined) body.dry_run = true;

  const result = await request('POST', '/v1/memories/consolidate', body) as any;
  if (outputJson) {
    out(result);
  } else {
    if (opts.dryRun) info('Dry run — no changes applied');
    const merged = result.merged_count ?? result.merged ?? '?';
    success(`Consolidated: ${merged} memories merged`);
    if (result.clusters) info(`Clusters found: ${result.clusters.length}`);
  }
}
