import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, table } from '../output.js';

/** Fetch all memories with pagination */
async function fetchAllMemories(): Promise<any[]> {
  const allMemories: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    const result = await request('GET', `/v1/memories?${params}`) as any;
    const memories = result.memories || result.data || [];
    allMemories.push(...memories);
    if (memories.length < pageSize) break;
    offset += pageSize;
  }

  return allMemories;
}

export async function cmdNamespace(subcmd: string, rest: string[], opts: ParsedArgs) {
  if (subcmd === 'list' || !subcmd) {
    const memories = await fetchAllMemories();

    const nsSet = new Set<string>();
    for (const mem of memories) {
      if (mem.namespace) nsSet.add(mem.namespace);
    }
    const namespaces = Array.from(nsSet).sort();

    if (outputJson) {
      out({ namespaces, count: namespaces.length });
    } else if (namespaces.length === 0) {
      console.log(`${c.dim}No namespaces found.${c.reset}`);
    } else {
      table(namespaces.map(ns => ({ namespace: ns })), [{ key: 'namespace', label: 'NAMESPACE', width: 30 }]);
      console.log(`${c.dim}─ ${namespaces.length} namespace${namespaces.length !== 1 ? 's' : ''}${c.reset}`);
    }
  } else if (subcmd === 'stats') {
    const memories = await fetchAllMemories();

    const nsCounts: Record<string, number> = { '': 0 };
    for (const mem of memories) {
      const ns = mem.namespace || '';
      nsCounts[ns] = (nsCounts[ns] || 0) + 1;
    }

    const rows = Object.entries(nsCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([ns, count]) => ({ namespace: ns || '(default)', count: String(count) }));

    if (outputJson) {
      out({ namespaces: rows });
    } else {
      table(rows, [
        { key: 'namespace', label: 'NAMESPACE', width: 30 },
        { key: 'count', label: 'COUNT', width: 10 },
      ]);
    }
  } else {
    throw new Error('Usage: namespace [list|stats]');
  }
}
