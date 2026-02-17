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
import { VERSION } from './config.js';
import { c } from './colors.js';
import { configureOutput, outputJson, readStdin } from './output.js';
import { setRequestTimeout } from './http.js';
import { printHelp } from './help.js';

// Commands
import { cmdStore } from './commands/store.js';
import { cmdRecall } from './commands/recall.js';
import { cmdList } from './commands/list.js';
import { cmdGet, cmdDelete, cmdUpdate } from './commands/memory.js';
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

// Configure request timeout
const TIMEOUT_MS = args.timeout ? parseInt(args.timeout) * 1000 : 30000;
setRequestTimeout(TIMEOUT_MS);

try {
  switch (cmd) {
    case 'store': {
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
    case 'search':
      if (!rest[0]) throw new Error('Query required');
      await cmdSearch(rest[0], args);
      break;
    case 'context':
      if (!rest[0]) throw new Error('Query required');
      await cmdContext(rest[0], args);
      break;
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
    case 'namespace':
      await cmdNamespace(rest[0], rest.slice(1), args);
      break;
    case 'init':
      await cmdInit(args);
      break;
    case 'history':
      if (!rest[0]) throw new Error('Memory ID required');
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
