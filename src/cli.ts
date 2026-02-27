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

import { parseArgs } from './args.js';
import { VERSION, DEFAULT_NAMESPACE, DEFAULT_TIMEOUT } from './config.js';
import { c } from './colors.js';
import { configureOutput, outputJson, readStdin } from './output.js';
import { setRequestTimeout } from './http.js';
import { printHelp } from './help.js';

// Commands
import { cmdStore, cmdStoreBatch } from './commands/store.js';
import { cmdRecall } from './commands/recall.js';
import { cmdList } from './commands/list.js';
import { cmdGet, cmdDelete, cmdUpdate, cmdBulkDelete } from './commands/memory.js';

import { cmdSearch, cmdContext, cmdExtract, cmdIngest, cmdConsolidate } from './commands/search.js';
import { cmdRelations } from './commands/relations.js';
import { cmdStatus, cmdStats, cmdCount, cmdSuggested, cmdGraph } from './commands/status.js';
import { cmdExport, cmdImport, cmdPurge } from './commands/data.js';
import { cmdNamespace } from './commands/namespace.js';
import { cmdInit, cmdConfig } from './commands/config.js';
import { cmdMigrate } from './commands/migrate.js';
import { cmdBrowse } from './commands/browse.js';
import { cmdCompletions } from './commands/completions.js';
import { cmdHistory } from './commands/history.js';

// ─── Main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = args._;

// Configure output state
configureOutput(args);

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

// Apply config-file / env-var defaults
if (!args.namespace && DEFAULT_NAMESPACE) args.namespace = DEFAULT_NAMESPACE;

// Configure request timeout
const TIMEOUT_MS = args.timeout ? parseInt(args.timeout) * 1000 : DEFAULT_TIMEOUT * 1000;
setRequestTimeout(TIMEOUT_MS);

try {
  switch (cmd) {
    case 'store': {
      if (args.batch) {
        const stdin = await readStdin();
        const lines = stdin ? stdin.split('\n') : [];
        await cmdStoreBatch(args, lines);
        break;
      }
      let content = rest[0] || (args.content && args.content !== true ? args.content : undefined);
      if (!content) {
        const stdin = await readStdin();
        if (stdin) content = stdin;
      }
      if (!content) throw new Error('Content required. Provide as argument, --content flag, or pipe via stdin.');
      await cmdStore(content, args);
      break;
    }
    case 'recall':
      if (!rest[0]) throw new Error('Query required. Usage: memoclaw recall "search query"');
      await cmdRecall(rest[0], args);
      break;
    case 'list':
      await cmdList(args);
      break;
    case 'get':
      if (!rest[0]) throw new Error('Memory ID required. Usage: memoclaw get <id>');
      await cmdGet(rest[0], args);
      break;
    case 'update':
      if (!rest[0]) throw new Error('Memory ID required. Usage: memoclaw update <id> --content "new text"');
      await cmdUpdate(rest[0], args);
      break;
    case 'delete':
      if (!rest[0]) throw new Error('Memory ID required. Usage: memoclaw delete <id>');
      await cmdDelete(rest[0]);
      break;
    case 'bulk-delete': {
      let ids = rest;
      if (ids.length === 0) {
        const stdin = await readStdin();
        if (stdin) ids = stdin.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
      }
      if (ids.length === 0) throw new Error('Memory IDs required. Usage: memoclaw bulk-delete <id1> <id2> ...');
      await cmdBulkDelete(ids, args);
      break;
    }
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
    case 'search':
      if (!rest[0]) throw new Error('Query required. Usage: memoclaw search "keyword"');
      await cmdSearch(rest[0], args);
      break;
    case 'context':
      if (!rest[0]) throw new Error('Query required. Usage: memoclaw context "what do I know about X?"');
      await cmdContext(rest[0], args);
      break;
    case 'consolidate':
      await cmdConsolidate(args);
      break;
    case 'relations': {
      const subcmd = rest[0];
      if (!subcmd) throw new Error('Subcommand required. Usage: memoclaw relations <list|create|delete> <memory-id>');
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
      if (!rest[0]) throw new Error('Shell required. Usage: memoclaw completions <bash|zsh|fish>');
      await cmdCompletions(rest[0]);
      break;
    case 'browse':
      await cmdBrowse(args);
      break;
    case 'config':
      await cmdConfig(rest[0], rest.slice(1));
      break;
    case 'graph':
      if (!rest[0]) throw new Error('Memory ID required. Usage: memoclaw graph <id>');
      await cmdGraph(rest[0], args);
      break;
    case 'purge':
      await cmdPurge(args);
      break;
    case 'count':
      await cmdCount(args);
      break;
    case 'namespace':
      await cmdNamespace(rest[0], rest.slice(1), args);
      break;
    case 'init':
      await cmdInit(args);
      break;
    case 'history':
      if (!rest[0]) throw new Error('Memory ID required. Usage: memoclaw history <id>');
      await cmdHistory(rest[0]);
      break;
    case 'migrate': {
      if (!rest[0]) throw new Error('Path required. Usage: memoclaw migrate <path>');
      await cmdMigrate(rest[0], args);
      break;
    }
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
