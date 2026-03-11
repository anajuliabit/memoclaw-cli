/**
 * Alias command: manage human-readable shortcuts for memory IDs.
 * 
 * memoclaw alias set <name> <memory-id>
 * memoclaw alias list
 * memoclaw alias rm <name>
 * 
 * Aliases stored locally in ~/.memoclaw/aliases.json (free, no API calls).
 */

import type { ParsedArgs } from '../args.js';
import { loadAliases, saveAliases } from '../alias.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, success, table, outputWrite } from '../output.js';

export async function cmdAlias(subcmd: string | undefined, rest: string[], opts: ParsedArgs) {
  const sub = subcmd || 'list';

  switch (sub) {
    case 'set': {
      const name = rest[0];
      const id = rest[1];
      if (!name || !id) throw new Error('Usage: memoclaw alias set <name> <memory-id>');
      if (name.includes(' ') || name.includes('/')) throw new Error('Alias name cannot contain spaces or slashes');
      
      const aliases = loadAliases();
      aliases[name] = id;
      saveAliases(aliases);

      if (outputJson) {
        out({ alias: name, id, action: 'set' });
      } else {
        success(`Alias ${c.cyan}@${name}${c.reset} → ${c.dim}${id.slice(0, 8)}…${c.reset}`);
      }
      break;
    }

    case 'list': {
      const aliases = loadAliases();
      const entries = Object.entries(aliases);
      
      if (entries.length === 0) {
        if (outputJson) {
          out({ aliases: [], count: 0 });
        } else {
          outputWrite(`${c.dim}No aliases defined. Create one with: memoclaw alias set <name> <id>${c.reset}`);
        }
        return;
      }

      if (outputJson) {
        out({ aliases: entries.map(([name, id]) => ({ name, id })), count: entries.length });
        return;
      }

      // Optionally fetch memory previews (best-effort, don't fail if API is down)
      const rows: Record<string, any>[] = [];
      for (const [name, id] of entries) {
        let preview = '';
        try {
          const mem = await request('GET', `/v1/memories/${id}`) as any;
          const content = mem?.memory?.content || mem?.content || '';
          preview = content.length > 50 ? content.slice(0, 47) + '...' : content;
        } catch {
          preview = `${c.dim}(unavailable)${c.reset}`;
        }
        rows.push({ alias: `@${name}`, id: id.slice(0, 12) + '…', preview });
      }

      table(rows, [
        { key: 'alias', label: 'ALIAS', width: 20 },
        { key: 'id', label: 'MEMORY ID', width: 14 },
        { key: 'preview', label: 'PREVIEW', width: 52 },
      ]);
      outputWrite(`\n${c.dim}${entries.length} alias${entries.length !== 1 ? 'es' : ''}${c.reset}`);
      break;
    }

    case 'rm':
    case 'remove':
    case 'delete': {
      const name = rest[0];
      if (!name) throw new Error('Usage: memoclaw alias rm <name>');
      
      const aliases = loadAliases();
      if (!aliases[name]) throw new Error(`Alias "${name}" not found`);
      
      delete aliases[name];
      saveAliases(aliases);

      if (outputJson) {
        out({ alias: name, action: 'removed' });
      } else {
        success(`Alias ${c.cyan}@${name}${c.reset} removed`);
      }
      break;
    }

    default:
      throw new Error(`Usage: memoclaw alias <set|list|rm> [args]\n\n  set <name> <id>   Create or update an alias\n  list              List all aliases\n  rm <name>         Remove an alias`);
  }
}
