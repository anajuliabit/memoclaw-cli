/**
 * History command: view change history for a memory
 */

import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, table } from '../output.js';

export async function cmdHistory(id: string) {
  const result = await request('GET', `/v1/memories/${id}/history`) as any;
  if (outputJson) {
    out(result);
    return;
  }

  const history = result.history || [];
  if (history.length === 0) {
    console.log(`${c.dim}No history entries found.${c.reset}`);
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
