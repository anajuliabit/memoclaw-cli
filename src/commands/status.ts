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
  const params = new URLSearchParams();
  if (opts.namespace) params.set('namespace', opts.namespace);
  params.set('limit', '1');

  const result = await request('GET', `/v1/memories?${params}`) as any;
  const total = result.total ?? '?';

  let tierData: any = {};
  try {
    tierData = await request('GET', '/v1/free-tier/status') as any;
  } catch {
    // Non-critical: stats still works without tier info
  }

  const statsRow = {
    total_memories: total,
    api_url: API_URL,
    wallet: tierData.wallet || getAccount().address,
    free_tier_remaining: tierData.free_tier_remaining,
    free_tier_total: tierData.free_tier_total,
  };

  if (outputJson) {
    out(statsRow);
  } else if (outputFormat === 'csv' || outputFormat === 'tsv' || outputFormat === 'yaml') {
    out([statsRow]);
  } else {
    outputWrite(`${c.bold}MemoClaw Stats${c.reset}`);
    outputWrite(`${c.dim}${'─'.repeat(40)}${c.reset}`);
    outputWrite(`Memories:        ${c.cyan}${total}${c.reset}`);
    outputWrite(`API:             ${c.dim}${API_URL}${c.reset}`);
    outputWrite(`Wallet:          ${c.dim}${tierData.wallet || getAccount().address}${c.reset}`);
    if (tierData.free_tier_remaining !== undefined) {
      outputWrite(`Free calls left: ${c.cyan}${tierData.free_tier_remaining}${c.reset}/${tierData.free_tier_total}`);
    }
    if (opts.namespace) {
      outputWrite(`Namespace:       ${c.cyan}${opts.namespace}${c.reset}`);
    }
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
