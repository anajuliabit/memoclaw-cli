/**
 * Single-memory commands: get, delete, update, copy, move
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputQuiet, outputFormat, out, outputWrite, success, progressBar, readStdin } from '../output.js';
import { validateContentLength, validateImportance, warnIfBooleanImportance } from '../validate.js';
import { parseDate, filterByDateRange } from '../dates.js';
import { readFileContent } from './store.js';

export async function cmdGet(id: string, opts?: ParsedArgs) {
  const result = await request('GET', `/v1/memories/${id}`) as any;
  if (outputJson) {
    out(result);
  } else if (opts?.raw) {
    const mem = result.memory || result;
    outputWrite(mem.content);
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    const mem = result.memory || result;
    const row = {
      id: mem.id || id,
      content: mem.content || '',
      importance: mem.importance?.toFixed(2) || '',
      namespace: mem.namespace || '',
      tags: mem.metadata?.tags?.join(', ') || '',
      type: mem.memory_type || '',
      created: mem.created_at || '',
      updated: mem.updated_at || '',
      immutable: mem.immutable ? 'yes' : '',
      pinned: mem.pinned ? 'yes' : '',
    };
    out([row]);
  } else {
    const mem = result.memory || result;
    outputWrite(`${c.bold}ID:${c.reset}         ${mem.id || id}`);
    outputWrite(`${c.bold}Content:${c.reset}    ${mem.content}`);
    if (mem.importance !== undefined) outputWrite(`${c.bold}Importance:${c.reset} ${mem.importance}`);
    if (mem.namespace) outputWrite(`${c.bold}Namespace:${c.reset}  ${mem.namespace}`);
    if (mem.metadata?.tags?.length) outputWrite(`${c.bold}Tags:${c.reset}       ${mem.metadata.tags.join(', ')}`);
    if (mem.memory_type) outputWrite(`${c.bold}Type:${c.reset}       ${mem.memory_type}`);
    if (mem.created_at) outputWrite(`${c.bold}Created:${c.reset}    ${new Date(mem.created_at).toLocaleString()}`);
    if (mem.updated_at) outputWrite(`${c.bold}Updated:${c.reset}    ${new Date(mem.updated_at).toLocaleString()}`);
    if (mem.immutable) outputWrite(`${c.bold}Immutable:${c.reset}  ${c.yellow}yes${c.reset}`);
    if (mem.pinned) outputWrite(`${c.bold}Pinned:${c.reset}     ${c.green}yes${c.reset}`);
    if (mem.expires_at) outputWrite(`${c.bold}Expires:${c.reset}    ${new Date(mem.expires_at).toLocaleString()}`);
    if (mem.session_id) outputWrite(`${c.bold}Session:${c.reset}    ${mem.session_id}`);
    if (mem.agent_id) outputWrite(`${c.bold}Agent:${c.reset}      ${mem.agent_id}`);
  }
}

export async function cmdDelete(id: string) {
  const result = await request('DELETE', `/v1/memories/${id}`);
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} deleted`);
  }
}

export async function cmdBulkDelete(ids: string[], opts: ParsedArgs) {
  const result = await request('POST', '/v1/memories/bulk-delete', { ids }) as any;
  if (outputJson) {
    out(result);
  } else {
    const deleted = result.deleted ?? ids.length;
    success(`Deleted ${c.cyan}${deleted}${c.reset} memories`);
  }
}

export async function cmdUpdate(id: string, opts: ParsedArgs) {
  const body: Record<string, any> = {};
  let content = opts.content && opts.content !== true ? String(opts.content) : undefined;
  if (!content && opts.file) {
    content = readFileContent(opts.file);
  }
  if (!content) {
    const stdin = await readStdin();
    if (stdin) content = stdin;
  }
  if (content) {
    validateContentLength(content);
    body.content = content;
  }
  if (opts.importance != null && !warnIfBooleanImportance(opts.importance)) {
    body.importance = validateImportance(opts.importance);
  }
  if (opts.memoryType) body.memory_type = opts.memoryType;
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.expiresAt) body.expires_at = opts.expiresAt;
  if (opts.pinned !== undefined) body.pinned = opts.pinned !== 'false' && opts.pinned !== false;
  if (opts.immutable !== undefined) body.immutable = opts.immutable !== 'false' && opts.immutable !== false;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;

  if (Object.keys(body).length === 0) {
    throw new Error('No fields to update. Use --content, --importance, --tags, etc.');
  }

  const result = await request('PATCH', `/v1/memories/${id}`, body);
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} updated`);
  }
}

export async function cmdPin(id: string, opts?: ParsedArgs) {
  const result = await request('PATCH', `/v1/memories/${id}`, { pinned: true });
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} pinned`);
  }
}

export async function cmdUnpin(id: string, opts?: ParsedArgs) {
  const result = await request('PATCH', `/v1/memories/${id}`, { pinned: false });
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} unpinned`);
  }
}

export async function cmdLock(id: string, opts?: ParsedArgs) {
  const result = await request('PATCH', `/v1/memories/${id}`, { immutable: true });
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} locked (immutable)`);
  }
}

export async function cmdUnlock(id: string, opts?: ParsedArgs) {
  const result = await request('PATCH', `/v1/memories/${id}`, { immutable: false });
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} unlocked (mutable)`);
  }
}

export async function cmdEdit(id: string, opts?: ParsedArgs) {
  const { execSync } = await import('child_process');
  const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');

  // Fetch the memory
  const result = await request('GET', `/v1/memories/${id}`) as any;
  const mem = result.memory || result;

  // Refuse to edit immutable memories
  if (mem.immutable) {
    throw new Error(`Memory ${id.slice(0, 8)}… is immutable (locked). Use 'memoclaw unlock ${id}' first.`);
  }

  // Warn if pinned
  if (mem.pinned) {
    outputWrite(`${c.yellow}Warning:${c.reset} This memory is pinned.`);
  }

  // Determine editor
  const editor = opts?.editor || process.env.EDITOR || process.env.VISUAL || 'vi';

  // Write content to temp file
  const tmpFile = join(tmpdir(), `memoclaw-edit-${id.slice(0, 8)}-${Date.now()}.md`);
  const originalContent = mem.content || '';
  writeFileSync(tmpFile, originalContent, { encoding: 'utf-8', mode: 0o600 });

  try {
    // Open in editor (quote path to handle spaces in tmpdir)
    execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });

    // Read back
    const newContent = readFileSync(tmpFile, 'utf-8');

    if (newContent === originalContent) {
      if (outputJson) {
        out({ unchanged: true, id });
      } else {
        outputWrite(`${c.dim}No changes made.${c.reset}`);
      }
      return;
    }

    // Validate and update
    validateContentLength(newContent);
    const updateResult = await request('PATCH', `/v1/memories/${id}`, { content: newContent });
    if (outputJson) {
      out(updateResult);
    } else {
      success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} updated`);
    }
  } finally {
    // Clean up temp file
    try { unlinkSync(tmpFile); } catch {}
  }
}

export async function cmdCopy(id: string, opts: ParsedArgs) {
  // Fetch the source memory
  const result = await request('GET', `/v1/memories/${id}`) as any;
  const mem = result.memory || result;

  // Build the new memory body, preserving original fields
  const body: Record<string, any> = { content: mem.content };
  if (mem.importance !== undefined) body.importance = mem.importance;
  if (mem.metadata?.tags?.length) body.metadata = { tags: [...mem.metadata.tags] };
  if (mem.memory_type) body.memory_type = mem.memory_type;
  if (mem.session_id) body.session_id = mem.session_id;
  if (mem.agent_id) body.agent_id = mem.agent_id;

  // Use source namespace unless overridden
  body.namespace = opts.namespace || mem.namespace;

  // Apply overrides from flags
  if (opts.importance != null && !warnIfBooleanImportance(opts.importance)) {
    body.importance = validateImportance(opts.importance);
  }
  if (opts.tags) {
    const newTags = opts.tags.split(',').map((t: string) => t.trim());
    body.metadata = { tags: newTags };
  }
  if (opts.memoryType) body.memory_type = opts.memoryType;
  // Deliberately do NOT copy immutable flag — new memory should be mutable

  const storeResult = await request('POST', '/v1/store', body) as any;
  if (opts.idOnly) {
    outputWrite(storeResult.id || '');
  } else if (outputJson) {
    out({ source: id, id: storeResult.id, copied: true });
  } else {
    success(`Copied ${c.cyan}${id.slice(0, 8)}…${c.reset} → ${c.cyan}${(storeResult.id || '?').slice(0, 8)}…${c.reset}`);
  }
}

export async function cmdMove(ids: string[], opts: ParsedArgs) {
  if (!opts.namespace) {
    throw new Error('Target namespace required. Usage: memoclaw move <id> --namespace <target>');
  }

  // If no explicit IDs but filter flags provided, resolve IDs from filters
  let resolvedMemories: Array<{ id: string; content?: string }> = [];
  if (ids.length === 0 && (opts.fromNamespace || opts.tags || opts.since || opts.until)) {
    resolvedMemories = await resolveFilteredMemories(opts);
    if (resolvedMemories.length === 0) {
      if (outputJson) {
        out(opts.dryRun ? { dry_run: true, would_move: 0, namespace: opts.namespace, ids: [] } : { moved: 0, namespace: opts.namespace, ids: [] });
      } else {
        success(`No memories matched the filter criteria`);
      }
      return;
    }
    ids = resolvedMemories.map(m => m.id);

    // --dry-run: show preview and exit without moving (#207)
    if (opts.dryRun) {
      if (outputJson) {
        out({ dry_run: true, would_move: ids.length, namespace: opts.namespace, ids });
      } else {
        out(`Dry run — would move ${ids.length} memor${ids.length === 1 ? 'y' : 'ies'}:`);
        for (const m of resolvedMemories) {
          const preview = (m.content || '').slice(0, 60).replace(/\n/g, ' ');
          outputWrite(`  ${c.cyan}${m.id.slice(0, 8)}${c.reset}  ${preview}${(m.content || '').length > 60 ? '…' : ''}`);
        }
      }
      return;
    }

    // Confirmation prompt for bulk filter-based moves (#206)
    // Skip when: --yes/-y, --json/-j, stdin is not a TTY, or only 1 match
    const skipConfirm = opts.yes || outputJson || !process.stdin.isTTY || ids.length <= 1;
    if (!skipConfirm) {
      const sampleCount = Math.min(resolvedMemories.length, 5);
      process.stderr.write(`\nFound ${c.bold}${ids.length}${c.reset} memories matching filters.\n`);
      for (let i = 0; i < sampleCount; i++) {
        const m = resolvedMemories[i];
        const preview = (m.content || '').slice(0, 60).replace(/\n/g, ' ');
        process.stderr.write(`  ${c.cyan}${m.id.slice(0, 8)}${c.reset}  ${preview}${(m.content || '').length > 60 ? '…' : ''}\n`);
      }
      if (ids.length > sampleCount) {
        process.stderr.write(`  ${c.dim}... and ${ids.length - sampleCount} more${c.reset}\n`);
      }
      process.stderr.write(`\nMove all ${ids.length} to namespace ${c.cyan}${opts.namespace}${c.reset}? [y/N] `);

      const confirmed = await askConfirm();
      if (!confirmed) {
        process.stderr.write('Aborted.\n');
        return;
      }
    } else if (!outputQuiet && !outputJson) {
      process.stderr.write(`${c.dim}Found ${ids.length} matching memor${ids.length === 1 ? 'y' : 'ies'}${c.reset}\n`);
    }
  }

  if (ids.length === 0) {
    throw new Error('Memory ID(s) or filter flags required. Usage: memoclaw move <id> --namespace <target>\n  Or: memoclaw move --from-namespace <src> --namespace <target>');
  }

  let moved = 0;
  for (const id of ids) {
    await request('PATCH', `/v1/memories/${id}`, { namespace: opts.namespace });
    moved++;
    if (!outputQuiet && ids.length > 10) {
      process.stderr.write(`\r  ${progressBar(moved, ids.length)}`);
    }
  }
  if (!outputQuiet && ids.length > 10) process.stderr.write('\n');

  if (outputJson) {
    out({ moved, namespace: opts.namespace, ids });
  } else {
    success(`Moved ${c.cyan}${moved}${c.reset} memor${moved === 1 ? 'y' : 'ies'} to namespace ${c.cyan}${opts.namespace}${c.reset}`);
  }
}

/** Prompt user for y/N confirmation via readline */
async function askConfirm(): Promise<boolean> {
  const readline = await import('readline');
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question('', answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/** Fetch memories matching filter flags (--from-namespace, --tags, --since, --until) */
async function resolveFilteredMemories(opts: ParsedArgs): Promise<Array<{ id: string; content?: string }>> {
  const params = new URLSearchParams({ limit: '1000' });
  if (opts.fromNamespace) params.set('namespace', opts.fromNamespace);
  if (opts.tags) params.set('tags', opts.tags);

  const sinceDate = opts.since ? parseDate(opts.since) : null;
  const untilDate = opts.until ? parseDate(opts.until) : null;
  if ((opts.since && !sinceDate) || (opts.until && !untilDate)) {
    throw new Error('Invalid date format. Use ISO 8601 (2025-01-01) or relative shorthand (1h, 7d, 2w, 1mo, 1y).');
  }

  const all: Array<{ id: string; content?: string }> = [];
  let offset = 0;

  while (true) {
    params.set('offset', String(offset));
    const result = await request('GET', `/v1/memories?${params}`) as any;
    const memories = result.memories || result.data || [];
    if (memories.length === 0) break;

    const filtered = (sinceDate || untilDate)
      ? filterByDateRange(memories, 'created_at', sinceDate, untilDate)
      : memories;
    all.push(...filtered.map((m: any) => ({ id: m.id, content: m.content })));

    if (memories.length < 1000) break;
    offset += 1000;
    if (!outputQuiet) process.stderr.write(`\r  ${c.dim}Scanning... ${all.length} matching${c.reset}`);
  }
  if (!outputQuiet && all.length > 0) process.stderr.write('\r' + ' '.repeat(60) + '\r');

  return all;
}
