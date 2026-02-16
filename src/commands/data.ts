/**
 * Data commands: export, import, purge
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputQuiet, out, success, warn, progressBar, outputWrite, readStdin } from '../output.js';

export async function cmdExport(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.namespace) params.set('namespace', opts.namespace);
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

  const exportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    count: allMemories.length,
    memories: allMemories,
  };

  outputWrite(JSON.stringify(exportData, null, 2));
  if (!outputQuiet) {
    console.error(`${c.green}✓${c.reset} Exported ${allMemories.length} memories`);
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

  const concurrency = opts.concurrency ? parseInt(opts.concurrency) : 1;
  const batchSize = Math.min(concurrency, memories.length);

  let imported = 0;
  let failed = 0;

  for (let i = 0; i < memories.length; i += batchSize) {
    const batch = memories.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (mem: any) => {
        const body: Record<string, any> = { content: mem.content };
        if (mem.importance !== undefined) body.importance = mem.importance;
        if (mem.metadata) body.metadata = mem.metadata;
        if (mem.namespace || opts.namespace) body.namespace = mem.namespace || opts.namespace;
        await request('POST', '/v1/store', body);
        return true;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') imported++;
      else {
        failed++;
        if (process.env.DEBUG) console.error(`Failed to import: ${result.reason}`);
      }
    }

    if (!outputQuiet) {
      process.stderr.write(`\r  ${progressBar(imported, memories.length)}`);
    }
  }

  if (!outputQuiet) process.stderr.write('\n');

  if (outputJson) {
    out({ imported, failed, total: memories.length });
  } else {
    success(`Imported ${imported}/${memories.length} memories${failed ? ` (${c.red}${failed} failed${c.reset})` : ''}`);
  }
}

export async function cmdPurge(opts: ParsedArgs) {
  const confirmed = opts.force || opts.yes;

  if (!confirmed) {
    if (!process.stdin.isTTY) {
      throw new Error('Use --force or --yes to confirm purge in non-interactive mode');
    }
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(r => rl.question(
      `${c.red}⚠ Delete ALL memories${opts.namespace ? ` in namespace "${opts.namespace}"` : ''}? Type "yes" to confirm: ${c.reset}`,
      r
    ));
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log(`${c.dim}Aborted.${c.reset}`);
      return;
    }
  }

  const params = new URLSearchParams({ limit: '100' });
  if (opts.namespace) params.set('namespace', opts.namespace);
  let deleted = 0;
  let failedInRow = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  while (true) {
    params.set('offset', '0');
    const result = await request('GET', `/v1/memories?${params}`) as any;
    const memories = result.memories || result.data || [];
    if (memories.length === 0) break;

    let batchDeleted = 0;
    for (const mem of memories) {
      try {
        await request('DELETE', `/v1/memories/${mem.id}`);
        deleted++;
        batchDeleted++;
        failedInRow = 0;
        if (!outputQuiet) process.stderr.write(`\r  ${progressBar(deleted, result.total || deleted)}`);
      } catch (e: any) {
        if (process.env.DEBUG) console.error(`\nFailed to delete ${mem.id}: ${e.message}`);
      }
    }

    if (batchDeleted === 0) {
      failedInRow++;
      if (failedInRow >= MAX_CONSECUTIVE_FAILURES) {
        warn(`Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive batches failed to delete any memories`);
        break;
      }
    }
  }

  if (!outputQuiet) process.stderr.write('\n');
  if (outputJson) {
    out({ deleted });
  } else {
    success(`Purged ${deleted} memories`);
  }
}
