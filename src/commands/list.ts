import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputTruncate, noTruncate, out, table } from '../output.js';

export async function cmdList(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.limit != null && opts.limit !== true) params.set('limit', opts.limit);
  if (opts.offset != null && opts.offset !== true) params.set('offset', opts.offset);
  if (opts.namespace) params.set('namespace', opts.namespace);

  // Watch mode
  if (opts.watch) {
    let lastTotal = -1;
    const pollInterval = parseInt(opts.watchInterval || '5000');

    console.log(`${c.dim}Watching for changes... Press Ctrl+C to stop.${c.reset}`);

    while (true) {
      try {
        const result = await request('GET', `/v1/memories?${params}`) as any;
        const memories = result.memories || result.data || [];
        const total = result.total ?? memories.length;

        if (total !== lastTotal) {
          if (lastTotal >= 0) console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
          lastTotal = total;

          if (memories.length === 0) {
            console.log(`${c.dim}No memories found.${c.reset}`);
          } else {
            const truncateWidth = outputTruncate || 50;
            const rows = memories.map((m: any) => ({
              id: m.id?.slice(0, 8) || '?',
              content: m.content?.length > truncateWidth ? m.content.slice(0, truncateWidth) + '…' : (m.content || ''),
              importance: m.importance?.toFixed(2) || '-',
              tags: m.metadata?.tags?.join(', ') || '',
              created: m.created_at ? new Date(m.created_at).toLocaleDateString() : '',
            }));
            table(rows, [
              { key: 'id', label: 'ID', width: 10 },
              { key: 'content', label: 'CONTENT', width: outputTruncate || 52 },
              { key: 'importance', label: 'IMP', width: 5 },
              { key: 'tags', label: 'TAGS', width: 20 },
              { key: 'created', label: 'CREATED', width: 12 },
            ]);
            console.log(`${c.dim}─ ${memories.length} of ${total} memories${c.reset}`);
          }
        }

        await new Promise(r => setTimeout(r, pollInterval));
      } catch (e) {
        if (process.env.DEBUG) console.error('Watch error:', e);
        await new Promise(r => setTimeout(r, pollInterval));
      }
    }
  }

  const result = await request('GET', `/v1/memories?${params}`) as any;

  if (outputJson) {
    out(result);
  } else {
    let memories = result.memories || result.data || [];

    // Client-side sorting
    if (opts.sortBy && memories.length > 0) {
      const sortKey = opts.sortBy;
      const reverse = !!opts.reverse;
      memories = [...memories].sort((a: any, b: any) => {
        let aVal = a[sortKey];
        let bVal = b[sortKey];
        if (aVal === undefined && sortKey.includes('.')) {
          const parts = sortKey.split('.');
          let obj: any = a;
          for (const p of parts) obj = obj?.[p];
          aVal = obj;
          obj = b;
          for (const p of parts) obj = obj?.[p];
          bVal = obj;
        }
        if (aVal?.includes?.('-') && !isNaN(Date.parse(aVal))) {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal as string).getTime();
        }
        if (sortKey === 'importance') {
          aVal = parseFloat(aVal) || 0;
          bVal = parseFloat(bVal) || 0;
        }
        if (aVal < bVal) return reverse ? 1 : -1;
        if (aVal > bVal) return reverse ? -1 : 1;
        return 0;
      });
    }

    if (memories.length === 0) {
      console.log(`${c.dim}No memories found.${c.reset}`);
    } else {
      const truncateWidth = outputTruncate || 50;

      let columns = [
        { key: 'id', label: 'ID', width: 10 },
        { key: 'content', label: 'CONTENT', width: outputTruncate || 52 },
        { key: 'importance', label: 'IMP', width: 5 },
        { key: 'tags', label: 'TAGS', width: 20 },
        { key: 'created', label: 'CREATED', width: 12 },
      ];

      if (opts.columns) {
        const selected = opts.columns.split(',').map((c: string) => c.trim());
        const colMap: Record<string, { key: string; label: string; width?: number }> = {
          id: { key: 'id', label: 'ID', width: 10 },
          content: { key: 'content', label: 'CONTENT', width: outputTruncate || 52 },
          importance: { key: 'importance', label: 'IMP', width: 5 },
          tags: { key: 'tags', label: 'TAGS', width: 20 },
          created: { key: 'created', label: 'CREATED', width: 12 },
          updated: { key: 'updated', label: 'UPDATED', width: 12 },
          namespace: { key: 'namespace', label: 'NAMESPACE', width: 15 },
          type: { key: 'memory_type', label: 'TYPE', width: 10 },
        };
        columns = selected.map((k: string) => colMap[k] || { key: k, label: k.toUpperCase(), width: 20 });
      }

      const rows = memories.map((m: any) => {
        const row: Record<string, any> = {};
        for (const col of columns) {
          let val = m[col.key];
          if (col.key === 'content' && val?.length > (col.width || 50)) {
            val = val.slice(0, (col.width || 50) - 1) + '…';
          } else if (col.key === 'importance' && val !== undefined) {
            val = val.toFixed(2);
          } else if (col.key === 'tags') {
            val = m.metadata?.tags?.join(', ') || '';
          } else if ((col.key === 'created' || col.key === 'updated') && m[`${col.key}_at`]) {
            val = new Date(m[`${col.key}_at`]).toLocaleDateString();
          } else if (val === undefined || val === null) {
            val = '';
          } else {
            val = String(val);
          }
          row[col.key] = val;
        }
        return row;
      });
      table(rows, columns, { wide: !!opts.wide });
      if (result.total !== undefined) {
        console.log(`${c.dim}─ ${memories.length} of ${result.total} memories${c.reset}`);
      }
    }
  }
}
