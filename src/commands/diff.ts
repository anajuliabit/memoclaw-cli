/**
 * Diff command: show content changes between memory versions
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, outputWrite } from '../output.js';

/** Simple line-by-line diff producing unified-style output */
function lineDiff(oldText: string, newText: string): { added: string[]; removed: string[]; lines: string[] } {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  let i = m, j = n;
  const result: { type: 'same' | 'add' | 'remove'; text: string }[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'same', text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', text: newLines[j - 1] });
      added.push(newLines[j - 1]);
      j--;
    } else {
      result.unshift({ type: 'remove', text: oldLines[i - 1] });
      removed.push(oldLines[i - 1]);
      i--;
    }
  }

  for (const r of result) {
    if (r.type === 'same') {
      lines.push(`  ${r.text}`);
    } else if (r.type === 'add') {
      lines.push(`${c.green}+ ${r.text}${c.reset}`);
    } else {
      lines.push(`${c.red}- ${r.text}${c.reset}`);
    }
  }

  return { added, removed, lines };
}

interface HistoryEntry {
  id: string;
  created_at: string;
  changes: Record<string, { old?: any; new?: any }>;
}

export async function cmdDiff(id: string, opts: ParsedArgs) {
  const result = await request('GET', `/v1/memories/${id}/history`) as any;
  const history: HistoryEntry[] = result.history || [];

  if (history.length === 0) {
    outputWrite(`${c.dim}No history entries found for this memory.${c.reset}`);
    return;
  }

  // Determine which revisions to diff
  const showAll = !!opts.all;
  const targetRevision = opts.revision ? parseInt(opts.revision, 10) : undefined;

  if (outputJson) {
    const diffs = buildJsonDiffs(history, showAll, targetRevision);
    out(diffs);
    return;
  }

  if (targetRevision !== undefined) {
    // Show specific revision diff
    if (targetRevision < 1 || targetRevision > history.length) {
      throw new Error(`Revision ${targetRevision} out of range. This memory has ${history.length} history entries.`);
    }
    const entry = history[targetRevision - 1];
    printEntryDiff(entry, targetRevision, id);
  } else if (showAll) {
    // Show all diffs in sequence
    for (let idx = 0; idx < history.length; idx++) {
      if (idx > 0) outputWrite('');
      printEntryDiff(history[idx], idx + 1, id);
    }
  } else {
    // Default: show latest change
    const entry = history[history.length - 1];
    printEntryDiff(entry, history.length, id);
  }
}

function printEntryDiff(entry: HistoryEntry, revision: number, memoryId: string) {
  const date = entry.created_at ? new Date(entry.created_at).toLocaleString() : '—';
  outputWrite(`${c.bold}Memory ${memoryId.slice(0, 8)}…${c.reset} — revision ${revision} (${date})`);
  outputWrite(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  const changes = entry.changes || {};
  if (Object.keys(changes).length === 0) {
    outputWrite(`${c.dim}  (no changes recorded)${c.reset}`);
    return;
  }

  for (const [field, change] of Object.entries(changes)) {
    const oldVal = change.old;
    const newVal = change.new;

    if (field === 'content' && typeof oldVal === 'string' && typeof newVal === 'string') {
      const { lines } = lineDiff(oldVal, newVal);
      outputWrite(`  ${c.bold}${field}:${c.reset}`);
      for (const line of lines) {
        outputWrite(`    ${line}`);
      }
    } else if (field === 'tags' || field === 'metadata') {
      outputWrite(`  ${c.bold}${field}:${c.reset}`);
      outputWrite(`    ${c.red}- ${JSON.stringify(oldVal)}${c.reset}`);
      outputWrite(`    ${c.green}+ ${JSON.stringify(newVal)}${c.reset}`);
    } else {
      outputWrite(`  ${c.bold}${field}:${c.reset} ${c.red}${oldVal ?? '(none)'}${c.reset} → ${c.green}${newVal ?? '(none)'}${c.reset}`);
    }
  }
  outputWrite(`${c.dim}${'─'.repeat(50)}${c.reset}`);
}

function buildJsonDiffs(history: HistoryEntry[], showAll: boolean, targetRevision?: number) {
  if (targetRevision !== undefined) {
    if (targetRevision < 1 || targetRevision > history.length) {
      return { error: `Revision ${targetRevision} out of range`, total: history.length };
    }
    return { revision: targetRevision, ...history[targetRevision - 1] };
  }
  if (showAll) {
    return { revisions: history.map((entry, idx) => ({ revision: idx + 1, ...entry })) };
  }
  return { revision: history.length, ...history[history.length - 1] };
}
