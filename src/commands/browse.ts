import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { cmdGet } from './memory.js';
import { cmdRecall } from './recall.js';
import { cmdStore } from './store.js';
import { cmdDelete } from './memory.js';
import { cmdStats } from './status.js';

export async function cmdBrowse(opts: ParsedArgs) {
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
          {
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
