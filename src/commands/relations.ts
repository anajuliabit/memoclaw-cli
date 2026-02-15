import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, success, table } from '../output.js';

export async function cmdRelations(subcmd: string, rest: string[], opts: ParsedArgs) {
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
