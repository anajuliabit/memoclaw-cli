/**
 * Status, stats, count, suggested, graph commands
 */

import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { API_URL } from '../config.js';
import { getAccount, getWalletAuthHeader } from '../auth.js';
import { getRequestTimeout } from '../http.js';
import { outputJson, outputTruncate, out, success, info, table } from '../output.js';

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const timeoutMs = getRequestTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    if (e.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to ${API_URL} — is the server running?`);
    }
    if (e.code === 'ENOTFOUND' || e.cause?.code === 'ENOTFOUND') {
      throw new Error(`DNS lookup failed for ${API_URL} — check your internet connection`);
    }
    throw new Error(`Network error: ${e.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function cmdStatus() {
  const walletAuth = await getWalletAuthHeader();
  const res = await fetchWithTimeout(`${API_URL}/v1/free-tier/status`, {
    headers: { 'x-wallet-auth': walletAuth }
  });

  if (res.ok) {
    const data = await res.json() as any;
    if (outputJson) {
      out(data);
    } else {
      console.log(`${c.bold}Wallet:${c.reset}     ${data.wallet}`);
      const remaining = data.free_tier_remaining ?? 0;
      const total = data.free_tier_total ?? 100;
      const pct = Math.round((remaining / total) * 100);
      const barLen = 20;
      const filled = Math.round((remaining / total) * barLen);
      const bar = `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(barLen - filled)}${c.reset}`;
      console.log(`${c.bold}Free tier:${c.reset}  ${remaining}/${total} calls remaining`);
      console.log(`            ${bar} ${pct}%`);
      if (remaining === 0) {
        console.log(`${c.yellow}→ Next calls will use x402 payment (pay-per-use USDC on Base)${c.reset}`);
      }
    }
  } else {
    const err = await res.json() as any;
    throw new Error(err.error?.message || 'Failed to get status');
  }
}

export async function cmdStats(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.namespace) params.set('namespace', opts.namespace);
  params.set('limit', '1');

  const result = await request('GET', `/v1/memories?${params}`) as any;
  const total = result.total ?? '?';

  const walletAuth = await getWalletAuthHeader();
  const statusRes = await fetchWithTimeout(`${API_URL}/v1/free-tier/status`, {
    headers: { 'x-wallet-auth': walletAuth }
  });

  let tierData: any = {};
  if (statusRes.ok) {
    tierData = await statusRes.json();
  }

  if (outputJson) {
    out({
      total_memories: total,
      api_url: API_URL,
      wallet: tierData.wallet || getAccount().address,
      free_tier_remaining: tierData.free_tier_remaining,
      free_tier_total: tierData.free_tier_total,
    });
  } else {
    console.log(`${c.bold}MemoClaw Stats${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
    console.log(`Memories:        ${c.cyan}${total}${c.reset}`);
    console.log(`API:             ${c.dim}${API_URL}${c.reset}`);
    console.log(`Wallet:          ${c.dim}${tierData.wallet || getAccount().address}${c.reset}`);
    if (tierData.free_tier_remaining !== undefined) {
      console.log(`Free calls left: ${c.cyan}${tierData.free_tier_remaining}${c.reset}/${tierData.free_tier_total}`);
    }
    if (opts.namespace) {
      console.log(`Namespace:       ${c.cyan}${opts.namespace}${c.reset}`);
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
  } else {
    console.log(String(total));
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
  } else {
    if (result.categories) {
      const cats = Object.entries(result.categories)
        .map(([k, v]) => `${c.bold}${k}${c.reset}=${v}`).join('  ');
      console.log(`Categories: ${cats}`);
      console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
    }

    const suggestions = result.suggested || [];
    if (suggestions.length === 0) {
      console.log(`${c.dim}No suggested memories.${c.reset}`);
    } else {
      for (const mem of suggestions) {
        const cat = mem.category?.toUpperCase() || '???';
        const catColor = { STALE: c.red, FRESH: c.green, HOT: c.yellow, DECAYING: c.magenta }[cat] || c.gray;
        const text = mem.content.length > 100 ? mem.content.slice(0, 100) + '…' : mem.content;
        console.log(`${catColor}[${cat}]${c.reset} ${c.dim}(${mem.review_score?.toFixed(2) || '?'})${c.reset} ${text}`);
        if (mem.metadata?.tags?.length) {
          console.log(`  ${c.dim}tags: ${mem.metadata.tags.join(', ')}${c.reset}`);
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

  console.log();
  console.log(`  ${c.bold}${c.cyan}[${shortId(mem.id)}]${c.reset} ${label(mem)}`);

  if (relations.length === 0) {
    console.log(`  ${c.dim}  └── (no relations)${c.reset}`);
  } else {
    for (let i = 0; i < relations.length; i++) {
      const r = relations[i];
      const isLast = i === relations.length - 1;
      const branch = isLast ? '└' : '├';
      const typeColor = {
        contradicts: c.red, supersedes: c.yellow, supports: c.green,
        derived_from: c.magenta, related_to: c.blue,
      }[r.relation_type] || c.dim;
      console.log(`  ${c.dim}  ${branch}──${c.reset} ${typeColor}${r.relation_type}${c.reset} ${c.dim}→${c.reset} ${c.cyan}[${shortId(r.target_id)}]${c.reset}`);
    }
  }
  console.log();
}
