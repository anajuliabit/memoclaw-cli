import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, table } from '../output.js';

/** Try /v1/namespaces endpoint, fall back to client-side pagination */
async function fetchNamespaces(): Promise<{ name: string; count?: number }[]> {
  try {
    const result = await request('GET', '/v1/namespaces') as any;
    const namespaces = result.namespaces || result.data || [];
    return namespaces.map((ns: any) =>
      typeof ns === 'string' ? { name: ns } : { name: ns.name || ns.namespace, count: ns.count ?? ns.memoryCount }
    );
  } catch {
    // Endpoint not available, fall back to client-side pagination
    return fetchNamespacesFromMemories();
  }
}

/** Fallback: fetch all memories and compute namespaces client-side */
async function fetchNamespacesFromMemories(): Promise<{ name: string; count: number }[]> {
  const nsCounts: Record<string, number> = {};
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    const result = await request('GET', `/v1/memories?${params}`) as any;
    const memories = result.memories || result.data || [];
    for (const mem of memories) {
      const ns = mem.namespace || '';
      nsCounts[ns] = (nsCounts[ns] || 0) + 1;
    }
    if (memories.length < pageSize) break;
    offset += pageSize;
  }

  return Object.entries(nsCounts)
    .filter(([ns]) => ns !== '')
    .map(([ns, count]) => ({ name: ns, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function cmdNamespace(subcmd: string, rest: string[], opts: ParsedArgs) {
  if (subcmd === 'list' || !subcmd) {
    const namespaces = await fetchNamespaces();

    if (outputJson) {
      out({ namespaces: namespaces.map(ns => ns.name), count: namespaces.length });
    } else if (namespaces.length === 0) {
      console.log(`${c.dim}No namespaces found.${c.reset}`);
    } else {
      table(namespaces.map(ns => ({ namespace: ns.name })), [{ key: 'namespace', label: 'NAMESPACE', width: 30 }]);
      console.log(`${c.dim}─ ${namespaces.length} namespace${namespaces.length !== 1 ? 's' : ''}${c.reset}`);
    }
  } else if (subcmd === 'stats') {
    const namespaces = await fetchNamespaces();

    // If we got counts from the API, use them; otherwise we already have counts from fallback
    const hasNoCounts = namespaces.some(ns => ns.count === undefined);
    let rows: { namespace: string; count: string }[];

    if (hasNoCounts) {
      // API returned names only, need to fetch memories for counts
      const withCounts = await fetchNamespacesFromMemories();
      rows = withCounts.map(ns => ({ namespace: ns.name || '(default)', count: String(ns.count) }));
    } else {
      rows = namespaces.map(ns => ({ namespace: ns.name || '(default)', count: String(ns.count) }));
    }

    rows.sort((a, b) => Number(b.count) - Number(a.count));

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
