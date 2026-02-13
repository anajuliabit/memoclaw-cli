#!/usr/bin/env node
/**
 * MemoClaw CLI - Memory-as-a-Service for AI agents
 * 
 * Environment:
 *   MEMOCLAW_URL - API endpoint (default: https://api.memoclaw.com)
 *   MEMOCLAW_PRIVATE_KEY - Wallet private key for auth + payments
 * 
 * Auth flow:
 *   1. Try free tier first (wallet signature, no payment)
 *   2. Fall back to x402 payment if free tier exhausted
 */

import { x402Client } from '@x402/core/client';
import { x402HTTPClient } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import { parseArgs } from './args.js';
import type { ParsedArgs } from './args.js';

const VERSION = '1.7.0';
const API_URL = process.env.MEMOCLAW_URL || 'https://api.memoclaw.com';
const PRIVATE_KEY = process.env.MEMOCLAW_PRIVATE_KEY as `0x${string}`;

// ─── Colors ──────────────────────────────────────────────────────────────────

const NO_COLOR = !!process.env.NO_COLOR || !process.stdout.isTTY;

const c = {
  reset: NO_COLOR ? '' : '\x1b[0m',
  bold: NO_COLOR ? '' : '\x1b[1m',
  dim: NO_COLOR ? '' : '\x1b[2m',
  red: NO_COLOR ? '' : '\x1b[31m',
  green: NO_COLOR ? '' : '\x1b[32m',
  yellow: NO_COLOR ? '' : '\x1b[33m',
  blue: NO_COLOR ? '' : '\x1b[34m',
  magenta: NO_COLOR ? '' : '\x1b[35m',
  cyan: NO_COLOR ? '' : '\x1b[36m',
  gray: NO_COLOR ? '' : '\x1b[90m',
};

// ─── Auth ────────────────────────────────────────────────────────────────────

function ensureAuth() {
  if (!PRIVATE_KEY) {
    console.error(`${c.red}Error:${c.reset} MEMOCLAW_PRIVATE_KEY environment variable required`);
    console.error(`${c.dim}Set it with: export MEMOCLAW_PRIVATE_KEY=0x...${c.reset}`);
    process.exit(1);
  }
}

let _account: ReturnType<typeof privateKeyToAccount> | null = null;
function getAccount() {
  if (!_account) {
    ensureAuth();
    _account = privateKeyToAccount(PRIVATE_KEY);
  }
  return _account;
}

const account = new Proxy({} as ReturnType<typeof privateKeyToAccount>, {
  get(_, prop) { return (getAccount() as any)[prop]; }
});

let _x402Client: x402HTTPClient | null = null;
function getX402Client() {
  if (!_x402Client) {
    const signer = toClientEvmSigner(account);
    const coreClient = new x402Client()
      .register('eip155:*', new ExactEvmScheme(signer));
    _x402Client = new x402HTTPClient(coreClient);
  }
  return _x402Client;
}

async function getWalletAuthHeader(): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `memoclaw-auth:${timestamp}`;
  const signature = await account.signMessage({ message });
  return `${account.address}:${timestamp}:${signature}`;
}

// ─── Stdin Helper ────────────────────────────────────────────────────────────

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk.toString());
  const text = chunks.join('').trim();
  return text || null;
}

// ─── Output Helpers ──────────────────────────────────────────────────────────

/** Global output mode from parsed args */
let outputJson = false;
let outputQuiet = false;

function out(data: any) {
  if (outputQuiet) return;
  if (outputJson) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

function success(msg: string) {
  if (outputQuiet) return;
  if (outputJson) return; // JSON mode suppresses decorative output
  console.log(`${c.green}✓${c.reset} ${msg}`);
}

function warn(msg: string) {
  console.error(`${c.yellow}⚠${c.reset} ${msg}`);
}

function info(msg: string) {
  if (outputQuiet) return;
  if (outputJson) return;
  console.error(`${c.blue}ℹ${c.reset} ${msg}`);
}

/** Print a simple table */
function table(rows: Record<string, any>[], columns?: { key: string; label: string; width?: number }[]) {
  if (rows.length === 0) return;
  
  if (outputJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (!columns) {
    // Auto-detect columns from first row
    columns = Object.keys(rows[0]).map(k => ({ key: k, label: k.toUpperCase() }));
  }

  // Calculate widths
  for (const col of columns) {
    if (!col.width) {
      col.width = Math.max(
        col.label.length,
        ...rows.map(r => String(r[col.key] ?? '').length)
      );
      col.width = Math.min(col.width, 60); // cap
    }
  }

  // Header
  const header = columns.map(col => col.label.padEnd(col.width!)).join('  ');
  console.log(`${c.bold}${header}${c.reset}`);
  console.log(`${c.dim}${columns.map(col => '─'.repeat(col.width!)).join('──')}${c.reset}`);

  // Rows
  for (const row of rows) {
    const line = columns!.map(col => {
      const val = String(row[col.key] ?? '');
      return val.length > col.width! ? val.slice(0, col.width! - 1) + '…' : val.padEnd(col.width!);
    }).join('  ');
    console.log(line);
  }
}

/** Simple progress bar */
function progressBar(current: number, total: number, width = 30): string {
  const pct = Math.min(current / total, 1);
  const filled = Math.round(pct * width);
  return `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(width - filled)}${c.reset} ${current}/${total}`;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function request(method: string, path: string, body: any = null) {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const walletAuth = await getWalletAuthHeader();
  headers['x-wallet-auth'] = walletAuth;

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e: any) {
    if (e.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to ${API_URL} — is the server running?`);
    }
    if (e.code === 'ENOTFOUND' || e.cause?.code === 'ENOTFOUND') {
      throw new Error(`DNS lookup failed for ${API_URL} — check your internet connection`);
    }
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out`);
    }
    throw new Error(`Network error: ${e.message}`);
  }

  const freeTierRemaining = res.headers.get('x-free-tier-remaining');
  if (freeTierRemaining !== null && process.env.DEBUG) {
    console.error(`${c.dim}Free tier remaining: ${freeTierRemaining}${c.reset}`);
  }

  if (res.status === 402) {
    const errorBody = await res.json();
    if (process.env.DEBUG) {
      console.error('=== 402 Response (switching to x402) ===');
      console.error('Headers:', Object.fromEntries(res.headers.entries()));
      console.error('Body:', JSON.stringify(errorBody, null, 2));
    }
    
    const client = getX402Client();
    const paymentRequired = client.getPaymentRequiredResponse(
      (name: string) => res.headers.get(name),
      errorBody
    );
    if (process.env.DEBUG) console.error('Payment required parsed:', JSON.stringify(paymentRequired, null, 2));
    
    const paymentPayload = await client.createPaymentPayload(paymentRequired);
    if (process.env.DEBUG) console.error('Payment payload created');
    
    const paymentHeaders = client.encodePaymentSignatureHeader(paymentPayload);
    if (process.env.DEBUG) console.error('Payment headers:', paymentHeaders);
    
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...paymentHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (process.env.DEBUG) {
      console.error('=== Retry Response ===');
      console.error('Status:', res.status);
      if (res.status !== 200) {
        const retryBody = await res.clone().text();
        console.error('Body:', retryBody);
      }
    }
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as any).error?.message || `HTTP ${res.status}`);
  }
  return data;
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdStore(content: string, opts: ParsedArgs) {
  const body: Record<string, any> = { content };
  if (opts.importance != null && opts.importance !== true) body.importance = parseFloat(opts.importance);
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.namespace) body.namespace = opts.namespace;

  const result = await request('POST', '/v1/store', body);
  if (outputJson) {
    out(result);
  } else {
    success(`Memory stored${result.id ? ` (${c.cyan}${result.id}${c.reset})` : ''}`);
    if (result.importance !== undefined) info(`Importance: ${result.importance}`);
  }
}

async function cmdRecall(query: string, opts: ParsedArgs) {
  const body: Record<string, any> = { query };
  if (opts.limit != null && opts.limit !== true) body.limit = parseInt(opts.limit);
  if (opts.minSimilarity != null && opts.minSimilarity !== true) body.min_similarity = parseFloat(opts.minSimilarity);
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.filters = { tags: opts.tags.split(',').map((t: string) => t.trim()) };

  const result = await request('POST', '/v1/recall', body) as any;
  
  if (outputJson) {
    out(result);
  } else if (opts.raw) {
    const memories = result.memories || [];
    for (const mem of memories) {
      console.log(mem.content);
    }
  } else {
    const memories = result.memories || [];
    if (memories.length === 0) {
      console.log(`${c.dim}No memories found.${c.reset}`);
    } else {
      for (const mem of memories) {
        const sim = mem.similarity?.toFixed(3) || '???';
        const simColor = (mem.similarity || 0) > 0.8 ? c.green : (mem.similarity || 0) > 0.5 ? c.yellow : c.red;
        console.log(`${simColor}[${sim}]${c.reset} ${mem.content}`);
        if (mem.metadata?.tags?.length) {
          console.log(`  ${c.dim}tags: ${mem.metadata.tags.join(', ')}${c.reset}`);
        }
        if (mem.id) {
          console.log(`  ${c.dim}id: ${mem.id}${c.reset}`);
        }
      }
      console.log(`${c.dim}─ ${memories.length} result${memories.length !== 1 ? 's' : ''}${c.reset}`);
    }
  }
}

async function cmdList(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.limit != null && opts.limit !== true) params.set('limit', opts.limit);
  if (opts.offset != null && opts.offset !== true) params.set('offset', opts.offset);
  if (opts.namespace) params.set('namespace', opts.namespace);

  const result = await request('GET', `/v1/memories?${params}`) as any;
  
  if (outputJson) {
    out(result);
  } else {
    const memories = result.memories || result.data || [];
    if (memories.length === 0) {
      console.log(`${c.dim}No memories found.${c.reset}`);
    } else {
      const rows = memories.map((m: any) => ({
        id: m.id?.slice(0, 8) || '?',
        content: m.content?.length > 50 ? m.content.slice(0, 50) + '…' : (m.content || ''),
        importance: m.importance?.toFixed(2) || '-',
        tags: m.metadata?.tags?.join(', ') || '',
        created: m.created_at ? new Date(m.created_at).toLocaleDateString() : '',
      }));
      table(rows, [
        { key: 'id', label: 'ID', width: 10 },
        { key: 'content', label: 'CONTENT', width: 52 },
        { key: 'importance', label: 'IMP', width: 5 },
        { key: 'tags', label: 'TAGS', width: 20 },
        { key: 'created', label: 'CREATED', width: 12 },
      ]);
      if (result.total !== undefined) {
        console.log(`${c.dim}─ ${memories.length} of ${result.total} memories${c.reset}`);
      }
    }
  }
}

async function cmdGet(id: string) {
  const result = await request('GET', `/v1/memories/${id}`) as any;
  if (outputJson) {
    out(result);
  } else {
    const mem = result.memory || result;
    console.log(`${c.bold}ID:${c.reset}         ${mem.id || id}`);
    console.log(`${c.bold}Content:${c.reset}    ${mem.content}`);
    if (mem.importance !== undefined) console.log(`${c.bold}Importance:${c.reset} ${mem.importance}`);
    if (mem.namespace) console.log(`${c.bold}Namespace:${c.reset}  ${mem.namespace}`);
    if (mem.metadata?.tags?.length) console.log(`${c.bold}Tags:${c.reset}       ${mem.metadata.tags.join(', ')}`);
    if (mem.memory_type) console.log(`${c.bold}Type:${c.reset}       ${mem.memory_type}`);
    if (mem.created_at) console.log(`${c.bold}Created:${c.reset}    ${new Date(mem.created_at).toLocaleString()}`);
    if (mem.updated_at) console.log(`${c.bold}Updated:${c.reset}    ${new Date(mem.updated_at).toLocaleString()}`);
    if (mem.pinned) console.log(`${c.bold}Pinned:${c.reset}     ${c.green}yes${c.reset}`);
  }
}

async function cmdDelete(id: string) {
  const result = await request('DELETE', `/v1/memories/${id}`);
  if (outputJson) {
    out(result);
  } else {
    success(`Memory ${c.cyan}${id.slice(0, 8)}…${c.reset} deleted`);
  }
}

async function cmdSuggested(opts: ParsedArgs) {
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

async function cmdUpdate(id: string, opts: ParsedArgs) {
  const body: Record<string, any> = {};
  if (opts.content) body.content = opts.content;
  if (opts.importance != null && opts.importance !== true) body.importance = parseFloat(opts.importance);
  if (opts.memoryType) body.memory_type = opts.memoryType;
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.expiresAt) body.expires_at = opts.expiresAt;
  if (opts.pinned !== undefined) body.pinned = opts.pinned === 'true' || opts.pinned === true;

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

async function cmdIngest(opts: ParsedArgs) {
  const body: Record<string, any> = {};
  if (opts.text) body.text = opts.text;
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;
  if (opts.autoRelate !== undefined) body.auto_relate = opts.autoRelate !== 'false';
  else body.auto_relate = true;

  if (!body.text) {
    const stdin = await readStdin();
    if (stdin) body.text = stdin;
  }

  if (!body.text) throw new Error('Text required (use --text or pipe via stdin)');

  const result = await request('POST', '/v1/ingest', body) as any;
  if (outputJson) {
    out(result);
  } else {
    const count = result.memories_created ?? result.count ?? '?';
    success(`Ingested text → ${count} memories created`);
  }
}

async function cmdExtract(text: string, opts: ParsedArgs) {
  const body: Record<string, any> = { text };
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;

  const result = await request('POST', '/v1/memories/extract', body);
  out(result);
}

async function cmdConsolidate(opts: ParsedArgs) {
  const body: Record<string, any> = {};
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.minSimilarity != null && opts.minSimilarity !== true) body.min_similarity = parseFloat(opts.minSimilarity);
  if (opts.mode) body.mode = opts.mode;
  if (opts.dryRun !== undefined) body.dry_run = true;

  const result = await request('POST', '/v1/memories/consolidate', body) as any;
  if (outputJson) {
    out(result);
  } else {
    if (opts.dryRun) {
      info('Dry run — no changes applied');
    }
    const merged = result.merged_count ?? result.merged ?? '?';
    success(`Consolidated: ${merged} memories merged`);
    if (result.clusters) {
      info(`Clusters found: ${result.clusters.length}`);
    }
  }
}

async function cmdRelations(subcmd: string, rest: string[], opts: ParsedArgs) {
  if (subcmd === 'list') {
    if (!rest[0]) throw new Error('Memory ID required');
    const result = await request('GET', `/v1/memories/${rest[0]}/relations`) as any;
    if (outputJson) {
      out(result);
    } else {
      const relations = result.relations || [];
      if (relations.length === 0) {
        console.log(`${c.dim}No relations found.${c.reset}`);
      } else {
        const rows = relations.map((r: any) => ({
          id: r.id?.slice(0, 8) || '?',
          type: r.relation_type || '?',
          target: r.target_id?.slice(0, 8) || '?',
        }));
        table(rows, [
          { key: 'id', label: 'ID', width: 10 },
          { key: 'type', label: 'TYPE', width: 16 },
          { key: 'target', label: 'TARGET', width: 10 },
        ]);
      }
    }
  } else if (subcmd === 'create') {
    if (!rest[0] || !rest[1] || !rest[2]) throw new Error('Usage: relations create <memory-id> <target-id> <type>');
    const validTypes = ['related_to', 'derived_from', 'contradicts', 'supersedes', 'supports'];
    if (!validTypes.includes(rest[2])) {
      throw new Error(`Invalid relation type "${rest[2]}". Valid: ${validTypes.join(', ')}`);
    }
    const body = { target_id: rest[1], relation_type: rest[2] };
    const result = await request('POST', `/v1/memories/${rest[0]}/relations`, body);
    if (outputJson) {
      out(result);
    } else {
      success(`Relation created: ${rest[0].slice(0, 8)}… ${c.cyan}${rest[2]}${c.reset} → ${rest[1].slice(0, 8)}…`);
    }
  } else if (subcmd === 'delete') {
    if (!rest[0] || !rest[1]) throw new Error('Usage: relations delete <memory-id> <relation-id>');
    const result = await request('DELETE', `/v1/memories/${rest[0]}/relations/${rest[1]}`);
    if (outputJson) {
      out(result);
    } else {
      success('Relation deleted');
    }
  } else {
    throw new Error('Usage: relations [list|create|delete]');
  }
}

async function cmdStatus() {
  const walletAuth = await getWalletAuthHeader();
  const res = await fetch(`${API_URL}/v1/free-tier/status`, {
    headers: { 'x-wallet-auth': walletAuth }
  });
  
  if (res.ok) {
    const data = await res.json() as any;
    if (outputJson) {
      out(data);
    } else {
      console.log(`${c.bold}Wallet:${c.reset}     ${data.wallet}`);
      const remaining = data.free_tier_remaining ?? 0;
      const total = data.free_tier_total ?? 1000;
      const pct = Math.round((remaining / total) * 100);
      const barLen = 20;
      const filled = Math.round((remaining / total) * barLen);
      const bar = `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(barLen - filled)}${c.reset}`;
      console.log(`${c.bold}Free tier:${c.reset}  ${remaining}/${total} calls remaining`);
      console.log(`            ${bar} ${pct}%`);
      if (remaining === 0) {
        console.log(`${c.yellow}→ Next calls will use x402 payment ($0.001/call)${c.reset}`);
      }
    }
  } else {
    const err = await res.json() as any;
    throw new Error(err.error?.message || 'Failed to get status');
  }
}

async function cmdExport(opts: ParsedArgs) {
  const params = new URLSearchParams();
  if (opts.namespace) params.set('namespace', opts.namespace);
  params.set('limit', opts.limit || '1000');
  let offset = 0;
  const allMemories: any[] = [];
  const limit = parseInt(opts.limit || '1000');

  // Paginate through all memories
  while (true) {
    params.set('offset', String(offset));
    const result = await request('GET', `/v1/memories?${params}`) as any;
    const memories = result.memories || result.data || [];
    allMemories.push(...memories);
    if (memories.length < limit) break;
    offset += limit;
    if (!outputQuiet) process.stderr.write(`${c.dim}Fetched ${allMemories.length} memories...${c.reset}\r`);
  }

  const exportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    count: allMemories.length,
    memories: allMemories,
  };

  // Always output JSON for export (it's data)
  console.log(JSON.stringify(exportData, null, 2));
  if (!outputQuiet) {
    console.error(`${c.green}✓${c.reset} Exported ${allMemories.length} memories`);
  }
}

async function cmdImport(opts: ParsedArgs) {
  let jsonText: string;

  if (opts.file) {
    const fs = await import('fs');
    jsonText = fs.readFileSync(opts.file, 'utf-8');
  } else {
    const stdin = await readStdin();
    if (!stdin) throw new Error('Provide --file <path> or pipe JSON via stdin');
    jsonText = stdin;
  }

  const data = JSON.parse(jsonText);
  const memories = data.memories || data;
  if (!Array.isArray(memories)) throw new Error('Invalid format: expected { memories: [...] } or [...]');

  let imported = 0;
  let failed = 0;

  for (const mem of memories) {
    try {
      const body: Record<string, any> = { content: mem.content };
      if (mem.importance !== undefined) body.importance = mem.importance;
      if (mem.metadata) body.metadata = mem.metadata;
      if (mem.namespace || opts.namespace) body.namespace = mem.namespace || opts.namespace;
      await request('POST', '/v1/store', body);
      imported++;
      if (!outputQuiet) {
        process.stderr.write(`\r  ${progressBar(imported, memories.length)}`);
      }
    } catch (e: any) {
      failed++;
      if (process.env.DEBUG) console.error(`Failed to import: ${e.message}`);
    }
  }

  if (!outputQuiet) process.stderr.write('\n');

  if (outputJson) {
    out({ imported, failed, total: memories.length });
  } else {
    success(`Imported ${imported}/${memories.length} memories${failed ? ` (${c.red}${failed} failed${c.reset})` : ''}`);
  }
}

async function cmdStats(opts: ParsedArgs) {
  // Gather stats from list endpoint
  const params = new URLSearchParams();
  if (opts.namespace) params.set('namespace', opts.namespace);
  params.set('limit', '1');
  
  const result = await request('GET', `/v1/memories?${params}`) as any;
  const total = result.total ?? '?';

  // Get free tier status too
  const walletAuth = await getWalletAuthHeader();
  const statusRes = await fetch(`${API_URL}/v1/free-tier/status`, {
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

async function cmdGraph(id: string, opts: ParsedArgs) {
  // Fetch memory and its relations, display as ASCII graph
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

async function cmdPurge(opts: ParsedArgs) {
  if (!opts.force) {
    // In non-interactive mode without --force, abort
    if (!process.stdin.isTTY) {
      throw new Error('Use --force to confirm purge in non-interactive mode');
    }
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(r => rl.question(
      `${c.red}⚠ Delete ALL memories${opts.namespace ? ` in namespace "${opts.namespace}"` : ''}? Type "yes" to confirm: ${c.reset}`,
      r
    ));
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log(`${c.dim}Aborted.${c.reset}`);
      return;
    }
  }

  // Paginate and delete all
  const params = new URLSearchParams({ limit: '100' });
  if (opts.namespace) params.set('namespace', opts.namespace);
  let deleted = 0;

  while (true) {
    params.set('offset', '0');
    const result = await request('GET', `/v1/memories?${params}`) as any;
    const memories = result.memories || result.data || [];
    if (memories.length === 0) break;

    for (const mem of memories) {
      await request('DELETE', `/v1/memories/${mem.id}`);
      deleted++;
      if (!outputQuiet) process.stderr.write(`\r  ${progressBar(deleted, result.total || deleted)}`);
    }
  }

  if (!outputQuiet) process.stderr.write('\n');
  if (outputJson) {
    out({ deleted });
  } else {
    success(`Purged ${deleted} memories`);
  }
}

async function cmdCount(opts: ParsedArgs) {
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

async function cmdCompletions(shell: string) {
  const commands = ['store', 'recall', 'list', 'get', 'update', 'delete', 'ingest', 'extract',
    'consolidate', 'relations', 'suggested', 'status', 'export', 'import', 'stats', 'browse',
    'completions', 'config', 'graph', 'purge', 'count'];
  
  if (shell === 'bash') {
    console.log(`# Add to ~/.bashrc:
# eval "$(memoclaw completions bash)"
_memoclaw() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local cmds="${commands.join(' ')}"
  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\$cmds" -- "\$cur") )
  fi
}
complete -F _memoclaw memoclaw`);
  } else if (shell === 'zsh') {
    console.log(`# Add to ~/.zshrc:
# eval "$(memoclaw completions zsh)"
_memoclaw() {
  local -a commands=(${commands.map(c => `'${c}'`).join(' ')})
  _describe 'command' commands
}
compdef _memoclaw memoclaw`);
  } else if (shell === 'fish') {
    console.log(`# Add to ~/.config/fish/completions/memoclaw.fish:
${commands.map(cmd => `complete -c memoclaw -n '__fish_use_subcommand' -a '${cmd}'`).join('\n')}`);
  } else {
    throw new Error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
  }
}

async function cmdConfig(subcmd: string, rest: string[]) {
  if (subcmd === 'show' || !subcmd) {
    const config: Record<string, string> = {
      MEMOCLAW_URL: API_URL,
      MEMOCLAW_PRIVATE_KEY: PRIVATE_KEY ? `${PRIVATE_KEY.slice(0, 6)}…${PRIVATE_KEY.slice(-4)}` : '(not set)',
      NO_COLOR: process.env.NO_COLOR || '(not set)',
      DEBUG: process.env.DEBUG || '(not set)',
    };
    if (outputJson) {
      out(config);
    } else {
      console.log(`${c.bold}MemoClaw Configuration${c.reset}`);
      console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
      for (const [key, val] of Object.entries(config)) {
        const isSet = !val.includes('not set');
        console.log(`  ${c.cyan}${key.padEnd(24)}${c.reset} ${isSet ? val : `${c.dim}${val}${c.reset}`}`);
      }
      console.log(`\n${c.dim}Set via environment variables or .env file${c.reset}`);
    }
  } else if (subcmd === 'check') {
    // Validate configuration
    const issues: string[] = [];
    if (!PRIVATE_KEY) issues.push('MEMOCLAW_PRIVATE_KEY is not set');
    else if (!PRIVATE_KEY.startsWith('0x')) issues.push('MEMOCLAW_PRIVATE_KEY should start with 0x');
    else if (PRIVATE_KEY.length !== 66) issues.push(`MEMOCLAW_PRIVATE_KEY has wrong length (${PRIVATE_KEY.length}, expected 66)`);

    if (outputJson) {
      out({ valid: issues.length === 0, issues });
    } else {
      if (issues.length === 0) {
        success('Configuration looks good!');
        try {
          const acct = getAccount();
          info(`Wallet address: ${acct.address}`);
        } catch {}
      } else {
        for (const issue of issues) {
          console.log(`${c.red}✗${c.reset} ${issue}`);
        }
      }
    }
  } else {
    throw new Error('Usage: config [show|check]');
  }
}

async function cmdBrowse(opts: ParsedArgs) {
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

  console.log(`${c.bold}MemoClaw Interactive Browser${c.reset} ${c.dim}(type "help" or "q" to quit)${c.reset}`);
  if (opts.namespace) console.log(`${c.dim}Namespace: ${opts.namespace}${c.reset}`);
  console.log();

  let offset = 0;
  const limit = 10;

  while (true) {
    const input = (await prompt(`${c.cyan}memoclaw>${c.reset} `)).trim();
    if (!input) continue;
    if (input === 'q' || input === 'quit' || input === 'exit') break;

    const parts = input.split(/\s+/);
    const browsCmd = parts[0];
    const browseArgs = parts.slice(1).join(' ');

    try {
      switch (browsCmd) {
        case 'help':
          console.log(`${c.bold}Commands:${c.reset}
  list / ls          List memories (paginated)
  next / n           Next page
  prev / p           Previous page
  get <id>           Show memory details
  recall <query>     Search memories
  store <content>    Store a new memory
  delete <id>        Delete a memory
  stats              Show stats
  q / quit           Exit browser`);
          break;
        case 'list': case 'ls': {
          offset = 0;
          const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
          if (opts.namespace) params.set('namespace', opts.namespace);
          const result = await request('GET', `/v1/memories?${params}`) as any;
          const memories = result.memories || result.data || [];
          if (memories.length === 0) { console.log(`${c.dim}No memories.${c.reset}`); break; }
          for (const m of memories) {
            const text = m.content?.length > 60 ? m.content.slice(0, 60) + '…' : (m.content || '');
            console.log(`  ${c.cyan}${(m.id || '?').slice(0, 8)}${c.reset}  ${text}`);
          }
          console.log(`${c.dim}─ showing ${offset + 1}-${offset + memories.length}${result.total ? ` of ${result.total}` : ''}${c.reset}`);
          break;
        }
        case 'next': case 'n':
          offset += limit;
          /* falls through to list logic */ {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (opts.namespace) params.set('namespace', opts.namespace);
            const result = await request('GET', `/v1/memories?${params}`) as any;
            const memories = result.memories || result.data || [];
            if (memories.length === 0) { console.log(`${c.dim}No more memories.${c.reset}`); offset = Math.max(0, offset - limit); break; }
            for (const m of memories) {
              const text = m.content?.length > 60 ? m.content.slice(0, 60) + '…' : (m.content || '');
              console.log(`  ${c.cyan}${(m.id || '?').slice(0, 8)}${c.reset}  ${text}`);
            }
            console.log(`${c.dim}─ showing ${offset + 1}-${offset + memories.length}${result.total ? ` of ${result.total}` : ''}${c.reset}`);
          }
          break;
        case 'prev': case 'p':
          offset = Math.max(0, offset - limit);
          {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (opts.namespace) params.set('namespace', opts.namespace);
            const result = await request('GET', `/v1/memories?${params}`) as any;
            const memories = result.memories || result.data || [];
            for (const m of memories) {
              const text = m.content?.length > 60 ? m.content.slice(0, 60) + '…' : (m.content || '');
              console.log(`  ${c.cyan}${(m.id || '?').slice(0, 8)}${c.reset}  ${text}`);
            }
            console.log(`${c.dim}─ showing ${offset + 1}-${offset + memories.length}${result.total ? ` of ${result.total}` : ''}${c.reset}`);
          }
          break;
        case 'get':
          if (!browseArgs) { console.log(`${c.red}Usage: get <id>${c.reset}`); break; }
          await cmdGet(browseArgs);
          break;
        case 'recall': case 'search':
          if (!browseArgs) { console.log(`${c.red}Usage: recall <query>${c.reset}`); break; }
          await cmdRecall(browseArgs, opts);
          break;
        case 'store':
          if (!browseArgs) { console.log(`${c.red}Usage: store <content>${c.reset}`); break; }
          await cmdStore(browseArgs, opts);
          break;
        case 'delete': case 'rm':
          if (!browseArgs) { console.log(`${c.red}Usage: delete <id>${c.reset}`); break; }
          await cmdDelete(browseArgs);
          break;
        case 'stats':
          await cmdStats(opts);
          break;
        default:
          console.log(`${c.dim}Unknown command. Type "help" for available commands.${c.reset}`);
      }
    } catch (e: any) {
      console.log(`${c.red}Error:${c.reset} ${e.message}`);
    }
    console.log();
  }

  rl.close();
  console.log(`${c.dim}Bye!${c.reset}`);
}

// ─── Help ────────────────────────────────────────────────────────────────────

function printHelp(command?: string) {
  if (command) {
    const subHelp: Record<string, string> = {
      store: `${c.bold}memoclaw store${c.reset} "content" [options]

Store a memory. Supports piping: ${c.dim}echo "content" | memoclaw store${c.reset}

Options:
  --importance <0-1>     Importance score (default: 0.5)
  --tags <tag1,tag2>     Comma-separated tags
  --namespace <name>     Memory namespace`,

      recall: `${c.bold}memoclaw recall${c.reset} "query" [options]

Search memories by semantic similarity.

Options:
  --limit <n>            Max results (default: 10)
  --min-similarity <0-1> Similarity threshold (default: 0.5)
  --namespace <name>     Filter by namespace
  --tags <tag1,tag2>     Filter by tags`,

      list: `${c.bold}memoclaw list${c.reset} [options]

List all memories in a table format.

Options:
  --limit <n>            Max results (default: 20)
  --offset <n>           Pagination offset
  --namespace <name>     Filter by namespace`,

      export: `${c.bold}memoclaw export${c.reset} [options]

Export all memories as JSON. Useful for backups.

  ${c.dim}memoclaw export > backup.json${c.reset}
  ${c.dim}memoclaw export --namespace project1 > project1.json${c.reset}

Options:
  --namespace <name>     Filter by namespace
  --limit <n>            Max per page (default: 1000)`,

      import: `${c.bold}memoclaw import${c.reset} [options]

Import memories from JSON file or stdin.

  ${c.dim}memoclaw import --file backup.json${c.reset}
  ${c.dim}cat backup.json | memoclaw import${c.reset}

Options:
  --file <path>          JSON file to import
  --namespace <name>     Override namespace for all memories`,

      stats: `${c.bold}memoclaw stats${c.reset} [options]

Show memory statistics and account info.

Options:
  --namespace <name>     Filter by namespace`,

      get: `${c.bold}memoclaw get${c.reset} <id>

Retrieve a single memory by its ID.`,

      config: `${c.bold}memoclaw config${c.reset} [show|check]

Show or validate your MemoClaw configuration.

Subcommands:
  show       Display current configuration (default)
  check      Validate configuration and test connectivity`,

      browse: `${c.bold}memoclaw browse${c.reset} [options]

Interactive memory browser (REPL). Explore, search, and manage
memories in a persistent session.

Options:
  --namespace <name>     Filter by namespace

Commands inside browser: list, get, recall, store, delete, stats, next, prev`,

      graph: `${c.bold}memoclaw graph${c.reset} <id>

Show an ASCII tree of a memory and its relations.

Options:
  --json                 Output as JSON`,

      purge: `${c.bold}memoclaw purge${c.reset} [options]

Delete ALL memories. Requires confirmation or --force.

  ${c.dim}memoclaw purge --force${c.reset}
  ${c.dim}memoclaw purge --namespace old-project --force${c.reset}

Options:
  --force                Skip confirmation prompt
  --namespace <name>     Only purge memories in namespace`,

      count: `${c.bold}memoclaw count${c.reset} [options]

Print the total number of memories (pipe-friendly).

  ${c.dim}memoclaw count${c.reset}
  ${c.dim}memoclaw count --namespace project1${c.reset}

Options:
  --namespace <name>     Count only in namespace`,

      completions: `${c.bold}memoclaw completions${c.reset} <bash|zsh|fish>

Generate shell completion scripts.

  ${c.dim}eval "$(memoclaw completions bash)"${c.reset}
  ${c.dim}eval "$(memoclaw completions zsh)"${c.reset}
  ${c.dim}memoclaw completions fish > ~/.config/fish/completions/memoclaw.fish${c.reset}`,
    };

    if (subHelp[command]) {
      console.log(subHelp[command]);
    } else {
      console.log(`No detailed help for "${command}". Run ${c.dim}memoclaw --help${c.reset} for overview.`);
    }
    return;
  }

  console.log(`${c.bold}MemoClaw CLI${c.reset} ${c.dim}v${VERSION}${c.reset} — Memory-as-a-Service for AI agents

${c.bold}Usage:${c.reset}
  memoclaw <command> [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}store${c.reset} "content"        Store a memory (also accepts stdin)
  ${c.cyan}recall${c.reset} "query"         Search memories by similarity
  ${c.cyan}list${c.reset}                   List memories in a table
  ${c.cyan}get${c.reset} <id>               Get a single memory by ID
  ${c.cyan}update${c.reset} <id>            Update a memory
  ${c.cyan}delete${c.reset} <id>            Delete a memory
  ${c.cyan}ingest${c.reset}                 Ingest raw text into memories
  ${c.cyan}extract${c.reset} "text"         Extract memories from text
  ${c.cyan}consolidate${c.reset}            Merge similar memories
  ${c.cyan}relations${c.reset} <sub>        Manage memory relations
  ${c.cyan}suggested${c.reset}              Get suggested memories for review
  ${c.cyan}status${c.reset}                 Check account & free tier info
  ${c.cyan}stats${c.reset}                  Memory statistics
  ${c.cyan}export${c.reset}                 Export all memories as JSON
  ${c.cyan}import${c.reset}                 Import memories from JSON
  ${c.cyan}completions${c.reset} <shell>    Generate shell completions
  ${c.cyan}browse${c.reset}                 Interactive memory browser (REPL)
  ${c.cyan}config${c.reset} [show|check]    Show or validate configuration
  ${c.cyan}graph${c.reset} <id>             ASCII visualization of memory relations
  ${c.cyan}purge${c.reset}                  Delete ALL memories (requires --force or confirm)
  ${c.cyan}count${c.reset}                  Quick memory count

${c.bold}Global Options:${c.reset}
  -h, --help             Show help (use with command for details)
  -v, --version          Show version
  -j, --json             Output as JSON (machine-readable)
  -q, --quiet            Suppress non-essential output
  -n, --namespace <name> Filter/set namespace
  -l, --limit <n>        Limit results
  -t, --tags <a,b>       Comma-separated tags
  --raw                  Raw output (content only, for piping)
  --force                Skip confirmation prompts
  --timeout <seconds>    Request timeout (default: 30)

${c.bold}Environment:${c.reset}
  MEMOCLAW_PRIVATE_KEY   Wallet private key for auth + payments
  MEMOCLAW_URL           API endpoint (default: https://api.memoclaw.com)
  NO_COLOR               Disable colored output
  DEBUG                  Enable debug logging

${c.bold}Piping:${c.reset}
  echo "meeting notes" | memoclaw store
  echo "long text" | memoclaw ingest
  memoclaw export | jq '.memories | length'
  cat backup.json | memoclaw import

${c.bold}Free Tier:${c.reset}
  Every wallet gets 1000 free API calls. After that, x402
  micropayments kick in automatically ($0.001/call USDC on Base).

${c.dim}API: https://api.memoclaw.com${c.reset}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = args._;

outputJson = !!args.json;
outputQuiet = !!args.quiet;

if (args.version) {
  console.log(`memoclaw ${VERSION}`);
  process.exit(0);
}

if (!cmd && args._.length === 0) {
  printHelp();
  process.exit(0);
}

if (args.help) {
  printHelp(cmd);
  process.exit(0);
}

// Wrap request() with timeout support
const TIMEOUT_MS = args.timeout ? parseInt(args.timeout) * 1000 : 30000;

try {
  switch (cmd) {
    case 'store': {
      let content = rest[0];
      if (!content) {
        const stdin = await readStdin();
        if (stdin) content = stdin;
      }
      if (!content) throw new Error('Content required. Provide as argument or pipe via stdin.');
      await cmdStore(content, args);
      break;
    }
    case 'recall':
      if (!rest[0]) throw new Error('Query required');
      await cmdRecall(rest[0], args);
      break;
    case 'list':
      await cmdList(args);
      break;
    case 'get':
      if (!rest[0]) throw new Error('Memory ID required');
      await cmdGet(rest[0]);
      break;
    case 'update':
      if (!rest[0]) throw new Error('Memory ID required');
      await cmdUpdate(rest[0], args);
      break;
    case 'delete':
      if (!rest[0]) throw new Error('Memory ID required');
      await cmdDelete(rest[0]);
      break;
    case 'ingest':
      await cmdIngest(args);
      break;
    case 'extract': {
      let text = rest[0];
      if (!text) {
        const stdin = await readStdin();
        if (stdin) text = stdin;
      }
      if (!text) throw new Error('Text required. Provide as argument or pipe via stdin.');
      await cmdExtract(text, args);
      break;
    }
    case 'consolidate':
      await cmdConsolidate(args);
      break;
    case 'relations': {
      const subcmd = rest[0];
      if (!subcmd) throw new Error('Usage: relations [list|create|delete]');
      await cmdRelations(subcmd, rest.slice(1), args);
      break;
    }
    case 'suggested':
      await cmdSuggested(args);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'export':
      await cmdExport(args);
      break;
    case 'import':
      await cmdImport(args);
      break;
    case 'stats':
      await cmdStats(args);
      break;
    case 'completions':
      if (!rest[0]) throw new Error('Shell required: bash, zsh, or fish');
      await cmdCompletions(rest[0]);
      break;
    case 'browse':
      await cmdBrowse(args);
      break;
    case 'config':
      await cmdConfig(rest[0], rest.slice(1));
      break;
    case 'graph':
      if (!rest[0]) throw new Error('Memory ID required');
      await cmdGraph(rest[0], args);
      break;
    case 'purge':
      await cmdPurge(args);
      break;
    case 'count':
      await cmdCount(args);
      break;
    case 'help':
      printHelp(rest[0]);
      break;
    default:
      console.error(`${c.red}Unknown command: ${cmd}${c.reset}`);
      console.error(`Run ${c.dim}memoclaw --help${c.reset} for usage.`);
      process.exit(1);
  }
} catch (err: any) {
  if (outputJson) {
    console.error(JSON.stringify({ error: err.message }));
  } else {
    console.error(`${c.red}Error:${c.reset} ${err.message}`);
  }
  process.exit(1);
}
