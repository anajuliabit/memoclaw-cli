/**
 * Status, stats, count, suggested, graph commands
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { API_URL } from '../config.js';
import { getAccount } from '../auth.js';

import { outputJson, outputFormat, outputTruncate, noTruncate, out, outputWrite, success, info, table, truncate } from '../output.js';

export async function cmdStatus() {
  const data = await request('GET', '/v1/free-tier/status') as any;

  if (outputJson) {
    out(data);
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    const row = {
      wallet: data.wallet || '',
      free_tier_remaining: data.free_tier_remaining ?? 0,
      free_tier_total: data.free_tier_total ?? 100,
    };
    out([row]);
  } else {
    const remaining = data.free_tier_remaining ?? 0;
    const total = data.free_tier_total ?? 100;
    const pct = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
    const barLen = 20;
    const filled = Math.max(0, Math.min(barLen, Math.round((remaining / total) * barLen)));
    const bar = `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(barLen - filled)}${c.reset}`;
    outputWrite(`${c.bold}Wallet:${c.reset}     ${data.wallet}`);
    outputWrite(`${c.bold}Free tier:${c.reset}  ${remaining}/${total} calls remaining`);
    outputWrite(`            ${bar} ${pct}%`);
    if (remaining === 0) {
      outputWrite(`${c.yellow}→ Next calls will use x402 payment (pay-per-use USDC on Base)${c.reset}`);
    }
  }
}

export async function cmdStats(opts: ParsedArgs) {
  const statsParams = new URLSearchParams();
  if (opts.namespace) statsParams.set('namespace', opts.namespace);
  const statsQuery = statsParams.toString();

  let statsData: any;
  let statsLimited = false;
  let statsError: any = null;
  try {
    const suffix = statsQuery ? `?${statsQuery}` : '';
    statsData = await request('GET', `/v1/stats${suffix}`) as any;
  } catch (err: any) {
    statsLimited = true;
    statsError = err;
    const fallbackParams = new URLSearchParams();
    if (opts.namespace) fallbackParams.set('namespace', opts.namespace);
    fallbackParams.set('limit', '1');
    try {
      const fallback = await request('GET', `/v1/memories?${fallbackParams}`) as any;
      const fallbackTotal = fallback.total ?? fallback.memories?.length ?? 0;
      statsData = {
        total_memories: fallbackTotal,
        pinned_count: null,
        never_accessed: null,
        total_accesses: null,
        avg_importance: null,
        oldest_memory: null,
        newest_memory: null,
        total_relations: null,
        by_type: {},
        by_namespace: {},
      };
    } catch {
      throw statsError;
    }
  }

  let tierData: any = {};
  try {
    tierData = await request('GET', '/v1/free-tier/status') as any;
  } catch {
    // Non-critical: stats still works without tier info
  }

  const wallet = tierData.wallet || getAccount().address;
  const freeTierRemaining = tierData.free_tier_remaining;
  const freeTierTotal = tierData.free_tier_total;
  const freeTierUsed = typeof freeTierRemaining === 'number' && typeof freeTierTotal === 'number'
    ? freeTierTotal - freeTierRemaining
    : undefined;

  const statsRow: any = {
    ...statsData,
    api_url: API_URL,
    wallet,
    namespace: opts.namespace || null,
    free_tier_remaining: freeTierRemaining,
    free_tier_total: freeTierTotal,
    free_tier_used: freeTierUsed,
    partial: statsLimited || undefined,
  };

  if (!statsRow.by_namespace) statsRow.by_namespace = {};
  if (!statsRow.by_type) statsRow.by_type = {};

  if (outputJson) {
    out(statsRow);
    return;
  }

  if (outputFormat === 'csv' || outputFormat === 'tsv') {
    const nsEntries = Object.entries(statsRow.by_namespace as Record<string, number>);
    const typeEntries = Object.entries(statsRow.by_type as Record<string, number>);
    const flatRow: any = {
      total_memories: statsRow.total_memories ?? '',
      pinned_count: statsRow.pinned_count ?? '',
      never_accessed: statsRow.never_accessed ?? '',
      total_accesses: statsRow.total_accesses ?? '',
      avg_importance: statsRow.avg_importance ?? '',
      oldest_memory: statsRow.oldest_memory || '',
      newest_memory: statsRow.newest_memory || '',
      total_relations: statsRow.total_relations ?? '',
      wallet,
      namespace: statsRow.namespace || '',
      free_tier_remaining: freeTierRemaining ?? '',
      free_tier_total: freeTierTotal ?? '',
      free_tier_used: freeTierUsed ?? '',
    };
    if (nsEntries.length > 0) {
      flatRow.top_namespace = nsEntries[0][0] || '(default)';
      flatRow.top_namespace_count = nsEntries[0][1];
    }
    if (typeEntries.length > 0) {
      flatRow.top_type = typeEntries[0][0];
      flatRow.top_type_count = typeEntries[0][1];
    }
    if (statsLimited) {
      flatRow.partial = 'true';
    }
    out([flatRow]);
    return;
  }

  if (outputFormat === 'yaml') {
    out(statsRow);
    return;
  }

  const formatNumber = (value: any) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return Number(value).toLocaleString();
    return String(value);
  };
  const formatAvg = (value: any) => value == null ? '—' : Number(value).toFixed(3);
  const formatDate = (value: any) => value ? new Date(value).toLocaleDateString() : '—';
  const nsEntries = Object.entries(statsRow.by_namespace as Record<string, number>);
  const typeEntries = Object.entries(statsRow.by_type as Record<string, number>);

  outputWrite(`${c.bold}MemoClaw Stats${c.reset}`);
  outputWrite(`${c.dim}${'─'.repeat(42)}${c.reset}`);
  outputWrite(`Total memories:   ${c.cyan}${formatNumber(statsRow.total_memories)}${c.reset}`);
  if (statsRow.pinned_count != null || statsRow.never_accessed != null) {
    outputWrite(`Pinned / never accessed: ${c.cyan}${formatNumber(statsRow.pinned_count)}${c.reset} / ${c.cyan}${formatNumber(statsRow.never_accessed)}${c.reset}`);
  }
  if (statsRow.total_accesses != null) {
    outputWrite(`Total accesses:   ${c.cyan}${formatNumber(statsRow.total_accesses)}${c.reset}`);
  }
  if (statsRow.avg_importance != null) {
    outputWrite(`Avg importance:   ${c.cyan}${formatAvg(statsRow.avg_importance)}${c.reset}`);
  }
  if (statsRow.oldest_memory || statsRow.newest_memory) {
    outputWrite(`Range:            ${formatDate(statsRow.oldest_memory)} → ${formatDate(statsRow.newest_memory)}`);
  }
  outputWrite(`API:              ${c.dim}${API_URL}${c.reset}`);
  outputWrite(`Wallet:           ${c.dim}${wallet}${c.reset}`);
  if (freeTierRemaining !== undefined) {
    const totalCalls = freeTierTotal ?? 100;
    const totalLabel = totalCalls != null ? `/${totalCalls}` : '';
    outputWrite(`Free calls left:  ${c.cyan}${formatNumber(freeTierRemaining)}${c.reset}${totalLabel}`);
  }
  if (opts.namespace) {
    outputWrite(`Namespace:        ${c.cyan}${opts.namespace}${c.reset}`);
  }
  if (statsLimited) {
    outputWrite(`${c.yellow}Stats endpoint unavailable on this API. Showing limited totals.${c.reset}`);
  }

  if (nsEntries.length) {
    outputWrite('');
    outputWrite(`${c.bold}Top namespaces${c.reset}`);
    const nsRows = nsEntries.slice(0, 10).map(([ns, count]) => ({
      namespace: ns || '(default)',
      memories: count,
    }));
    table(nsRows, [
      { key: 'namespace', label: 'NAMESPACE', width: 20 },
      { key: 'memories', label: 'MEMORIES', width: 10 },
    ], { wide: !!opts.wide });
  }

  if (typeEntries.length) {
    outputWrite('');
    outputWrite(`${c.bold}Top memory types${c.reset}`);
    const typeRows = typeEntries.slice(0, 10).map(([type, count]) => ({
      type: type || '(unknown)',
      memories: count,
    }));
    table(typeRows, [
      { key: 'type', label: 'TYPE', width: 20 },
      { key: 'memories', label: 'MEMORIES', width: 10 },
    ], { wide: !!opts.wide });
  }
}

export async function cmdCount(opts: ParsedArgs) {
  const params = new URLSearchParams({ limit: '1' });
  if (opts.namespace) params.set('namespace', opts.namespace);
  const result = await request('GET', `/v1/memories?${params}`) as any;
  const total = result.total ?? '?';

  if (outputJson) {
    out({ count: total, namespace: opts.namespace || null });
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    out([{ count: total, namespace: opts.namespace || '' }]);
  } else {
    outputWrite(String(total));
  }
}

export async function cmdSuggested(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.limit != null && opts.limit !== true) params.set('limit', opts.limit);
  if (opts.namespace) params.set('namespace', opts.namespace);
  if (opts.category) params.set('category', opts.category);

  const result = await request('GET', `/v1/suggested?${params}`) as any;

  if (outputJson) {
    out(result);
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    const suggestions = result.suggested || [];
    const rows = suggestions.map((m: any) => ({
      id: m.id || '',
      category: m.category || '',
      review_score: m.review_score?.toFixed(2) || '',
      content: m.content || '',
      importance: m.importance?.toFixed(2) || '',
      tags: m.metadata?.tags?.join(', ') || '',
    }));
    out(rows);
  } else {
    if (result.categories) {
      const cats = Object.entries(result.categories)
        .map(([k, v]) => `${c.bold}${k}${c.reset}=${v}`).join('  ');
      outputWrite(`Categories: ${cats}`);
      outputWrite(`${c.dim}${'─'.repeat(60)}${c.reset}`);
    }

    const suggestions = result.suggested || [];
    if (suggestions.length === 0) {
      outputWrite(`${c.dim}No suggested memories.${c.reset}`);
    } else {
      for (const mem of suggestions) {
        const cat = mem.category?.toUpperCase() || '???';
        const catColor = { STALE: c.red, FRESH: c.green, HOT: c.yellow, DECAYING: c.magenta }[cat] || c.gray;
        const maxLen = noTruncate ? Infinity : (outputTruncate || 100);
        const text = truncate(mem.content || '', maxLen);
        outputWrite(`${catColor}[${cat}]${c.reset} ${c.dim}(${mem.review_score?.toFixed(2) || '?'})${c.reset} ${text}`);
        if (mem.metadata?.tags?.length) {
          outputWrite(`  ${c.dim}tags: ${mem.metadata.tags.join(', ')}${c.reset}`);
        }
      }
    }
  }
}

export async function cmdGraph(id: string, opts: ParsedArgs) {
  const result = await request('GET', `/v1/memories/${id}`) as any;
  const mem = result.memory || result;
  const relResult = await request('GET', `/v1/memories/${id}/relations`) as any;
  const relations = relResult.relations || [];

  if (outputJson) {
    out({ memory: mem, relations });
    return;
  }

  const label = (m: any) => {
    const text = (m.content || '').slice(0, 40);
    return text.length < (m.content || '').length ? text + '…' : text;
  };

  const shortId = (s: string) => s?.slice(0, 8) || '?';

  outputWrite('');
  outputWrite(`  ${c.bold}${c.cyan}[${shortId(mem.id)}]${c.reset} ${label(mem)}`);

  if (relations.length === 0) {
    outputWrite(`  ${c.dim}  └── (no relations)${c.reset}`);
  } else {
    for (let i = 0; i < relations.length; i++) {
      const r = relations[i];
      const isLast = i === relations.length - 1;
      const branch = isLast ? '└' : '├';
      const typeColor = {
        contradicts: c.red, supersedes: c.yellow, supports: c.green,
        derived_from: c.magenta, related_to: c.blue,
      }[r.relation_type] || c.dim;
      outputWrite(`  ${c.dim}  ${branch}──${c.reset} ${typeColor}${r.relation_type}${c.reset} ${c.dim}→${c.reset} ${c.cyan}[${shortId(r.target_id)}]${c.reset}`);
    }
  }
  outputWrite('');
}
