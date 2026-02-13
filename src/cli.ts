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

const API_URL = process.env.MEMOCLAW_URL || 'https://api.memoclaw.com';
const PRIVATE_KEY = process.env.MEMOCLAW_PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
  console.error('Error: MEMOCLAW_PRIVATE_KEY environment variable required');
  process.exit(1);
}

// Setup wallet
const account = privateKeyToAccount(PRIVATE_KEY);

// x402 client (lazy init - only when needed)
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

/**
 * Generate wallet auth header for free tier
 * Format: {address}:{timestamp}:{signature}
 */
async function getWalletAuthHeader(): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `memoclaw-auth:${timestamp}`;
  const signature = await account.signMessage({ message });
  return `${account.address}:${timestamp}:${signature}`;
}

function parseArgs(args: string[]) {
  const result: Record<string, any> = { _: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i += 2;
      } else {
        result[key] = true;
        i++;
      }
    } else {
      result._.push(arg);
      i++;
    }
  }
  return result;
}

async function request(method: string, path: string, body: any = null) {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  // Try free tier first
  const walletAuth = await getWalletAuthHeader();
  headers['x-wallet-auth'] = walletAuth;

  let res = await fetch(url, { ...options, headers });

  // Check free tier remaining
  const freeTierRemaining = res.headers.get('x-free-tier-remaining');
  if (freeTierRemaining !== null) {
    if (process.env.DEBUG) {
      console.error(`Free tier remaining: ${freeTierRemaining}`);
    }
  }

  // Handle 402 Payment Required (free tier exhausted or not applicable)
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
    
    // Payment required - proceeding with x402
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

async function store(content: string, opts: Record<string, any>) {
  const body: Record<string, any> = { content };
  if (opts.importance) body.importance = parseFloat(opts.importance);
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.namespace) body.namespace = opts.namespace;

  const result = await request('POST', '/v1/store', body);
  console.log(JSON.stringify(result, null, 2));
}

async function recall(query: string, opts: Record<string, any>) {
  const body: Record<string, any> = { query };
  if (opts.limit) body.limit = parseInt(opts.limit);
  if (opts.minSimilarity) body.min_similarity = parseFloat(opts.minSimilarity);
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.filters = { tags: opts.tags.split(',').map((t: string) => t.trim()) };

  const result = await request('POST', '/v1/recall', body) as any;
  
  if (opts.raw) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const mem of result.memories || []) {
      console.log(`[${mem.similarity?.toFixed(3) || '???'}] ${mem.content}`);
      if (mem.metadata?.tags?.length) console.log(`  tags: ${mem.metadata.tags.join(', ')}`);
    }
  }
}

async function list(opts: Record<string, any>) {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', opts.limit);
  if (opts.offset) params.set('offset', opts.offset);
  if (opts.namespace) params.set('namespace', opts.namespace);

  const result = await request('GET', `/v1/memories?${params}`);
  console.log(JSON.stringify(result, null, 2));
}

async function deleteMemory(id: string) {
  const result = await request('DELETE', `/v1/memories/${id}`);
  console.log(JSON.stringify(result, null, 2));
}

async function suggested(opts: Record<string, any>) {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', opts.limit);
  if (opts.namespace) params.set('namespace', opts.namespace);
  if (opts.category) params.set('category', opts.category);

  const result = await request('GET', `/v1/suggested?${params}`) as any;
  
  if (opts.raw) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Show category summary
    if (result.categories) {
      console.log('Categories:', Object.entries(result.categories)
        .map(([k, v]) => `${k}=${v}`).join(', '));
      console.log('---');
    }
    
    for (const mem of result.suggested || []) {
      const cat = mem.category?.toUpperCase() || '???';
      console.log(`[${cat}] (${mem.review_score?.toFixed(2) || '?'}) ${mem.content.slice(0, 100)}...`);
      if (mem.metadata?.tags?.length) console.log(`  tags: ${mem.metadata.tags.join(', ')}`);
    }
  }
}

async function update(id: string, opts: Record<string, any>) {
  const body: Record<string, any> = {};
  if (opts.content) body.content = opts.content;
  if (opts.importance) body.importance = parseFloat(opts.importance);
  if (opts.memoryType) body.memory_type = opts.memoryType;
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.tags) body.metadata = { tags: opts.tags.split(',').map((t: string) => t.trim()) };
  if (opts.expiresAt) body.expires_at = opts.expiresAt;
  if (opts.pinned !== undefined) body.pinned = opts.pinned === 'true' || opts.pinned === true;

  const result = await request('PATCH', `/v1/memories/${id}`, body);
  console.log(JSON.stringify(result, null, 2));
}

async function ingest(opts: Record<string, any>) {
  const body: Record<string, any> = {};
  if (opts.text) body.text = opts.text;
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;
  if (opts.autoRelate !== undefined) body.auto_relate = opts.autoRelate !== 'false';
  else body.auto_relate = true;

  // Read from stdin if no text provided
  if (!body.text && !process.stdin.isTTY) {
    const chunks: string[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk.toString());
    body.text = chunks.join('');
  }

  if (!body.text) throw new Error('Text required (use --text or pipe via stdin)');

  const result = await request('POST', '/v1/ingest', body);
  console.log(JSON.stringify(result, null, 2));
}

async function extract(text: string, opts: Record<string, any>) {
  const body: Record<string, any> = { text };
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.agentId) body.agent_id = opts.agentId;

  const result = await request('POST', '/v1/memories/extract', body);
  console.log(JSON.stringify(result, null, 2));
}

async function consolidate(opts: Record<string, any>) {
  const body: Record<string, any> = {};
  if (opts.namespace) body.namespace = opts.namespace;
  if (opts.minSimilarity) body.min_similarity = parseFloat(opts.minSimilarity);
  if (opts.mode) body.mode = opts.mode;
  if (opts.dryRun !== undefined) body.dry_run = true;

  const result = await request('POST', '/v1/memories/consolidate', body);
  console.log(JSON.stringify(result, null, 2));
}

async function createRelation(memoryId: string, targetId: string, relationType: string, opts: Record<string, any>) {
  const body: Record<string, any> = { target_id: targetId, relation_type: relationType };
  const result = await request('POST', `/v1/memories/${memoryId}/relations`, body);
  console.log(JSON.stringify(result, null, 2));
}

async function listRelations(memoryId: string) {
  const result = await request('GET', `/v1/memories/${memoryId}/relations`);
  console.log(JSON.stringify(result, null, 2));
}

async function deleteRelation(memoryId: string, relationId: string) {
  const result = await request('DELETE', `/v1/memories/${memoryId}/relations/${relationId}`);
  console.log(JSON.stringify(result, null, 2));
}

async function status() {
  // Check free tier status
  const walletAuth = await getWalletAuthHeader();
  const res = await fetch(`${API_URL}/v1/free-tier/status`, {
    headers: { 'x-wallet-auth': walletAuth }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log(`Wallet: ${data.wallet}`);
    console.log(`Free tier: ${data.free_tier_remaining}/${data.free_tier_total} calls remaining`);
    if (data.free_tier_remaining === 0) {
      console.log('→ Next calls will use x402 payment ($0.001/call)');
    }
  } else {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to get status');
  }
}

function printHelp() {
  console.log(`MemoClaw CLI - Memory-as-a-Service for AI agents

Usage:
  memoclaw store "content" [options]
    --importance <0-1>     Importance score (default: 0.5)
    --tags <tag1,tag2>     Comma-separated tags
    --namespace <name>     Memory namespace

  memoclaw recall "query" [options]
    --limit <n>            Max results (default: 10)
    --min-similarity <0-1> Similarity threshold (default: 0.5)
    --namespace <name>     Filter by namespace
    --tags <tag1,tag2>     Filter by tags
    --raw                  Output raw JSON

  memoclaw list [options]
    --limit <n>            Max results (default: 20)
    --offset <n>           Pagination offset
    --namespace <name>     Filter by namespace

  memoclaw update <id> [options]
    --content <text>       New content
    --importance <0-1>     New importance score
    --memory-type <type>   New memory type
    --namespace <name>     New namespace
    --tags <tag1,tag2>     New tags
    --expires-at <date>    Expiry date (ISO 8601) or "null"
    --pinned <true|false>  Pin/unpin memory

  memoclaw delete <id>

  memoclaw ingest [options]
    --text <text>          Raw text to ingest (or pipe via stdin)
    --namespace <name>     Namespace for memories
    --session-id <id>      Session identifier
    --agent-id <id>        Agent identifier
    --auto-relate <bool>   Auto-create relations (default: true)

  memoclaw extract "text" [options]
    --namespace <name>     Namespace for memories
    --session-id <id>      Session identifier
    --agent-id <id>        Agent identifier

  memoclaw consolidate [options]
    --namespace <name>     Namespace to consolidate
    --min-similarity <0-1> Similarity threshold for clustering
    --mode <mode>          Consolidation mode
    --dry-run              Preview without merging

  memoclaw relations list <memory-id>
  memoclaw relations create <memory-id> <target-id> <type>
    Types: related_to, derived_from, contradicts, supersedes, supports
  memoclaw relations delete <memory-id> <relation-id>

  memoclaw suggested [options]
    --limit <n>            Max results (default: 10)
    --namespace <name>     Filter by namespace
    --category <cat>       Filter: stale|fresh|hot|decaying
    --raw                  Output raw JSON

  memoclaw status
    Check free tier remaining and wallet info

Environment:
  MEMOCLAW_PRIVATE_KEY   Wallet private key for auth + payments

Free Tier:
  Every wallet gets 1000 free API calls. After that, x402
  micropayments kick in automatically ($0.001/call USDC on Base).

API: https://api.memoclaw.com`);
}

const args = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = args._;

try {
  switch (cmd) {
    case 'store':
      if (!rest[0]) throw new Error('Content required');
      await store(rest[0], args);
      break;
    case 'recall':
      if (!rest[0]) throw new Error('Query required');
      await recall(rest[0], args);
      break;
    case 'list':
      await list(args);
      break;
    case 'update':
      if (!rest[0]) throw new Error('Memory ID required');
      await update(rest[0], args);
      break;
    case 'delete':
      if (!rest[0]) throw new Error('Memory ID required');
      await deleteMemory(rest[0]);
      break;
    case 'ingest':
      await ingest(args);
      break;
    case 'extract':
      if (!rest[0]) throw new Error('Text required');
      await extract(rest[0], args);
      break;
    case 'consolidate':
      await consolidate(args);
      break;
    case 'relations': {
      const subcmd = rest[0];
      if (subcmd === 'list') {
        if (!rest[1]) throw new Error('Memory ID required');
        await listRelations(rest[1]);
      } else if (subcmd === 'create') {
        if (!rest[1] || !rest[2] || !rest[3]) throw new Error('Usage: relations create <memory-id> <target-id> <type>');
        await createRelation(rest[1], rest[2], rest[3], args);
      } else if (subcmd === 'delete') {
        if (!rest[1] || !rest[2]) throw new Error('Usage: relations delete <memory-id> <relation-id>');
        await deleteRelation(rest[1], rest[2]);
      } else {
        throw new Error('Usage: relations [list|create|delete]');
      }
      break;
    }
    case 'suggested':
      await suggested(args);
      break;
    case 'status':
      await status();
      break;
    default:
      printHelp();
  }
} catch (err: any) {
  console.error('Error:', err.message);
  process.exit(1);
}
