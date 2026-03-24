/**
 * History command: view change history for a memory
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputFormat, out, outputWrite, table } from '../output.js';

export async function cmdHistory(id: string, opts?: ParsedArgs) {
  const result = await request('GET', `/v1/memories/${id}/history`) as any;

  let history = result.history || [];

  // Apply --limit: show only the N most recent entries
  const userLimit = opts?.limit != null && opts.limit !== true
    ? (() => { const n = parseInt(String(opts.limit)); return !isNaN(n) && n > 0 ? n : undefined; })()
    : undefined;
  if (userLimit != null && userLimit > 0) {
    history = history.slice(-userLimit);
  }

  if (outputJson) {
    out({ ...result, history });
    return;
  }

  if (history.length === 0) {
    outputWrite(`${c.dim}No history entries found.${c.reset}`);
    return;
  }

  if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    const rows = history.map((entry: any) => ({
      id: entry.id || '',
      date: entry.created_at || '',
      fields: Object.keys(entry.changes || {}).join(', ') || '',
    }));
    out(rows);
    return;
  }

  const rows = history.map((entry: any) => {
    const changes = entry.changes || {};
    const fields = Object.keys(changes).join(', ') || '—';
    const date = entry.created_at
      ? new Date(entry.created_at).toLocaleString()
      : '—';
    return {
      id: entry.id?.slice(0, 8) || '?',
      date,
      fields,
    };
  });

  table(rows, [
    { key: 'id', label: 'ID', width: 10 },
    { key: 'date', label: 'DATE', width: 22 },
    { key: 'fields', label: 'CHANGED FIELDS', width: 40 },
  ]);
}
