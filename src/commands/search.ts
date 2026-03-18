/**
 * Search, context, extract, ingest, consolidate commands
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputFormat, outputTruncate, noTruncate, out, outputWrite, success, info, truncate, table, readStdin } from '../output.js';
import { validateContentLength, validateBulkContentLength } from '../validate.js';
import { parseDate, filterByDateRange, overfetchLimit } from '../dates.js';
import { sortMemories } from './list.js';

export async function cmdSearch(query: string, opts: ParsedArgs) {
  const body: Record<string, any> = { query };
  let userLimit: number | undefined;

  if (opts.limit != null && opts.limit !== true) {
    const parsedLimit = parseInt(String(opts.limit));
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      userLimit = parsedLimit;
      body.limit = parsedLimit;
    }
  }
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.memoryType) body.memory_type = opts.memoryType;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;
  if (opts.tags && opts.tags !== true) {
    const tags = String(opts.tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length > 0) body.tags = tags;
  }

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
  if (hasDateFilter) {
    body.limit = overfetchLimit(userLimit);
  }
  const trimLimit = hasDateFilter && userLimit ? userLimit : undefined;

  const result = await request('POST', '/v1/search', body) as any;

  if (outputJson) {
    if (hasDateFilter) {
      let filtered = filterByDateRange(result.memories || result.data || [], 'created_at', sinceDate, untilDate);
      if (trimLimit) filtered = filtered.slice(0, trimLimit);
      filtered = sortMemories(filtered, opts);
      out({ ...result, memories: filtered });
    } else {
      let memories = result.memories || result.data || [];
      memories = sortMemories(memories, opts);
      out({ ...result, memories });
    }
  } else if (opts.raw) {
    let memories = result.memories || result.data || [];
    memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
    if (trimLimit) memories = memories.slice(0, trimLimit);
    memories = sortMemories(memories, opts);
    for (const mem of memories) {
      outputWrite(mem.content);
    }
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    let memories = result.memories || result.data || [];
    memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
    if (trimLimit) memories = memories.slice(0, trimLimit);
    memories = sortMemories(memories, opts);
    const rows = memories.map((m: any) => ({
      id: m.id || '',
      content: m.content || '',
      importance: m.importance?.toFixed(2) || '',
      namespace: m.namespace || '',
      tags: m.metadata?.tags?.join(', ') || '',
      created: m.created_at || '',
    }));
    out(rows);
  } else {
    let memories = result.memories || result.data || [];
    memories = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
    if (trimLimit) memories = memories.slice(0, trimLimit);
    memories = sortMemories(memories, opts);
    if (memories.length === 0) {
      outputWrite(`${c.dim}No memories found.${c.reset}`);
    } else {
      for (const mem of memories) {
        const content = (noTruncate || !outputTruncate) ? (mem.content || '') : truncate(mem.content || '', outputTruncate);
        outputWrite(`${c.cyan}${(mem.id || '?').slice(0, 8)}${c.reset}  ${content}`);
        if (mem.metadata?.tags?.length) {
          outputWrite(`  ${c.dim}tags: ${mem.metadata.tags.join(', ')}${c.reset}`);
        }
      }
      outputWrite(`${c.dim}─ ${memories.length} result${memories.length !== 1 ? 's' : ''} (text search, free)${c.reset}`);
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
      outputWrite(context);
    } else {
      out(result);
    }
  }
}

export async function cmdExtract(text: string, opts: ParsedArgs) {
  validateBulkContentLength(text, 'Extract text');
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
  validateBulkContentLength(body.text, 'Ingest text');

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
