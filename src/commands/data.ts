/**
 * Data commands: export, import, purge
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputQuiet, outputFormat, outputFile, out, success, warn, progressBar, outputWrite, readStdin } from '../output.js';
import { parseDate, filterByDateRange } from '../dates.js';

export async function cmdExport(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.namespace) params.set('namespace', opts.namespace);
  if (opts.tags) params.set('tags', opts.tags);
  params.set('limit', opts.limit || '1000');
  let offset = 0;
  const allMemories: any[] = [];
  const limit = parseInt(opts.limit || '1000');

  while (true) {
    params.set('offset', String(offset));
    const result = await request('GET', `/v1/memories?${params}`) as any;
    const memories = result.memories || result.data || [];
    allMemories.push(...memories);
    if (memories.length < limit) break;
    offset += limit;
    if (!outputQuiet) process.stderr.write(`${c.dim}Fetched ${allMemories.length} memories...${c.reset}\r`);
  }

  // Apply date filters
  const sinceDate = opts.since ? parseDate(opts.since) : null;
  const untilDate = opts.until ? parseDate(opts.until) : null;
  if ((opts.since && !sinceDate) || (opts.until && !untilDate)) {
    throw new Error(
      `Invalid date format. Use ISO 8601 (2025-01-01) or relative shorthand (1h, 7d, 2w, 1mo, 1y).`
    );
  }

  const filteredMemories = filterByDateRange(allMemories, 'created_at', sinceDate, untilDate);

  const exportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    count: filteredMemories.length,
    memories: filteredMemories,
  };

  if (outputJson || outputFormat === 'json') {
    outputWrite(JSON.stringify(exportData, null, 2));
  } else if (outputFormat === 'csv' || outputFormat === 'tsv') {
    const sep = outputFormat === 'tsv' ? '\t' : ',';
    if (filteredMemories.length > 0) {
      const headers = ['id', 'content', 'importance', 'namespace', 'tags', 'created_at'];
      outputWrite(headers.join(sep));
      for (const m of filteredMemories) {
        const row = [
          m.id || '',
          m.content || '',
          m.importance?.toString() || '',
          m.namespace || '',
          m.metadata?.tags?.join(';') || '',
          m.created_at || '',
        ].map(v => {
          if (outputFormat === 'csv' && (v.includes(',') || v.includes('"') || v.includes('\n'))) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return outputFormat === 'tsv' ? v.replace(/[\t\n]/g, ' ') : v;
        });
        outputWrite(row.join(sep));
      }
    }
  } else if (outputFormat === 'yaml') {
    const yamlLib = await import('js-yaml');
    outputWrite(yamlLib.default.dump(exportData, { indent: 2, lineWidth: 120 }));
  } else {
    outputWrite(JSON.stringify(exportData, null, 2));
  }
  if (!outputQuiet) {
    const filterNote = (sinceDate || untilDate) ? ` (filtered from ${allMemories.length})` : '';
    const destNote = outputFile ? ` → ${outputFile}` : '';
    console.error(`${c.green}✓${c.reset} Exported ${filteredMemories.length} memories${filterNote}${destNote}`);
  }
}

export async function cmdImport(opts: ParsedArgs) {
  let jsonText: string;

  if (opts.file) {
    const fs = await import('fs');
    jsonText = fs.readFileSync(opts.file, 'utf-8');
  } else {
    const stdin = await readStdin();
    if (!stdin) throw new Error('Provide --file <path> or pipe JSON via stdin');
    jsonText = stdin;
  }

  const data = JSON.parse(jsonText);
  const memories = data.memories || data;
  if (!Array.isArray(memories)) throw new Error('Invalid format: expected { memories: [...] } or [...]');

  const BATCH_SIZE = 100; // API max per batch request
  const concurrency = Math.max(1, parseInt(opts.concurrency || '1'));

  let imported = 0;
  let failed = 0;

  // Build all batches
  const batches: any[][] = [];
  for (let i = 0; i < memories.length; i += BATCH_SIZE) {
    batches.push(memories.slice(i, i + BATCH_SIZE));
  }

  const processBatch = async (chunk: any[]) => {
    const batchBody = chunk.map((mem: any) => {
      const entry: Record<string, any> = { content: mem.content };
      if (mem.importance !== undefined) entry.importance = mem.importance;
      if (mem.metadata) entry.metadata = mem.metadata;
      if (opts.namespace || mem.namespace) entry.namespace = opts.namespace || mem.namespace;
      if (mem.memory_type) entry.memory_type = mem.memory_type;
      if (mem.session_id) entry.session_id = mem.session_id;
      if (mem.agent_id) entry.agent_id = mem.agent_id;
      if (mem.expires_at) entry.expires_at = mem.expires_at;
      if (mem.pinned !== undefined) entry.pinned = mem.pinned;
      if (mem.immutable !== undefined) entry.immutable = mem.immutable;
      return entry;
    });

    try {
      await request('POST', '/v1/store/batch', { memories: batchBody });
      imported += chunk.length;
    } catch (e: any) {
      // Fall back to individual stores if batch endpoint fails
      if (process.env.DEBUG) console.error(`\nBatch failed, falling back to individual stores: ${e.message}`);
      for (const mem of chunk) {
        try {
          const body: Record<string, any> = { content: mem.content };
          if (mem.importance !== undefined) body.importance = mem.importance;
          if (mem.metadata) body.metadata = mem.metadata;
          if (mem.namespace || opts.namespace) body.namespace = mem.namespace || opts.namespace;
          await request('POST', '/v1/store', body);
          imported++;
        } catch (innerErr: any) {
          failed++;
          if (process.env.DEBUG) console.error(`Failed to import: ${innerErr.message}`);
        }
      }
    }

    if (!outputQuiet) {
      process.stderr.write(`\r  ${progressBar(imported + failed, memories.length)}`);
    }
  };

  // Process batches with concurrency
  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrent = batches.slice(i, i + concurrency);
    await Promise.all(concurrent.map(processBatch));
  }

  if (!outputQuiet) process.stderr.write('\n');

  if (outputJson) {
    out({ imported, failed, total: memories.length });
  } else {
    success(`Imported ${imported}/${memories.length} memories${failed ? ` (${c.red}${failed} failed${c.reset})` : ''}`);
  }
}

export async function cmdPurge(opts: ParsedArgs) {
  // Parse date filters
  const sinceDate = opts.since ? parseDate(opts.since) : null;
  const untilDate = opts.until ? parseDate(opts.until) : null;
  if ((opts.since && !sinceDate) || (opts.until && !untilDate)) {
    throw new Error(
      `Invalid date format. Use ISO 8601 (2025-01-01) or relative shorthand (1h, 7d, 2w, 1mo, 1y).`
    );
  }
  const hasDateFilter = !!(sinceDate || untilDate);

  const confirmed = opts.force || opts.yes;

  if (!confirmed) {
    if (!process.stdin.isTTY) {
      throw new Error('Use --force or --yes to confirm purge in non-interactive mode');
    }

    // Fetch count before confirming so the user knows the impact
    let countLabel = '';
    try {
      const countParams = new URLSearchParams({ limit: '1' });
      if (opts.namespace) countParams.set('namespace', opts.namespace);
      const countResult = await request('GET', `/v1/memories?${countParams}`) as any;
      const total = countResult.total;
      if (total !== undefined) countLabel = ` ${total}`;
    } catch {}

    const dateNote = hasDateFilter
      ? ` matching date range${sinceDate ? ` since ${sinceDate.toISOString().slice(0, 10)}` : ''}${untilDate ? ` until ${untilDate.toISOString().slice(0, 10)}` : ''}`
      : '';
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(r => rl.question(
      `${c.red}⚠ Delete${hasDateFilter ? '' : ' ALL'}${countLabel} memories${opts.namespace ? ` in namespace "${opts.namespace}"` : ''}${dateNote}? Type "yes" to confirm: ${c.reset}`,
      r
    ));
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      outputWrite(`${c.dim}Aborted.${c.reset}`);
      return;
    }
  }

  const params = new URLSearchParams({ limit: '100' });
  if (opts.namespace) params.set('namespace', opts.namespace);
  let deleted = 0;
  let failedInRow = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  let useBulk = true;
  let offset = 0;

  while (true) {
    params.set('offset', hasDateFilter ? String(offset) : '0');
    const result = await request('GET', `/v1/memories?${params}`) as any;
    let memories = result.memories || result.data || [];
    if (memories.length === 0) break;

    // Apply date filters client-side when --since/--until are provided
    if (hasDateFilter) {
      const filtered = filterByDateRange(memories, 'created_at', sinceDate, untilDate);
      const skipped = memories.length - filtered.length;
      memories = filtered;
      // Advance offset past non-matching memories
      if (memories.length === 0) {
        offset += result.memories?.length || result.data?.length || 100;
        // If we've gone past all results, stop
        if (result.total !== undefined && offset >= result.total) break;
        failedInRow++;
        if (failedInRow >= MAX_CONSECUTIVE_FAILURES * 2) break;
        continue;
      }
      failedInRow = 0;
    }

    const ids = memories.map((m: any) => m.id);
    let batchDeleted = 0;

    if (useBulk) {
      try {
        const bulkResult = await request('POST', '/v1/memories/bulk-delete', { ids }) as any;
        batchDeleted = bulkResult.deleted ?? ids.length;
        deleted += batchDeleted;
        failedInRow = 0;
        if (!outputQuiet) process.stderr.write(`\r  ${progressBar(deleted, hasDateFilter ? deleted : (result.total || deleted))}`);
      } catch {
        // Bulk delete not available, fall back to one-by-one
        useBulk = false;
      }
    }

    if (!useBulk) {
      for (const mem of memories) {
        try {
          await request('DELETE', `/v1/memories/${mem.id}`);
          deleted++;
          batchDeleted++;
          failedInRow = 0;
          if (!outputQuiet) process.stderr.write(`\r  ${progressBar(deleted, hasDateFilter ? deleted : (result.total || deleted))}`);
        } catch (e: any) {
          if (process.env.DEBUG) console.error(`\nFailed to delete ${mem.id}: ${e.message}`);
        }
      }
    }

    if (batchDeleted === 0) {
      failedInRow++;
      if (failedInRow >= MAX_CONSECUTIVE_FAILURES) {
        warn(`Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive batches failed to delete any memories`);
        break;
      }
    }

    // When date filtering, advance offset since we're not deleting everything in the page
    if (hasDateFilter) {
      offset += 100;
      if (result.total !== undefined && offset >= result.total) break;
    }
  }

  if (!outputQuiet) process.stderr.write('\n');
  if (outputJson) {
    out({ deleted, ...(hasDateFilter ? { filtered: true } : {}) });
  } else {
    success(`Purged ${deleted} memories${hasDateFilter ? ' (date-filtered)' : ''}`);
  }
}
