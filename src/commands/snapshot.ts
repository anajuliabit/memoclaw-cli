/**
 * Snapshot command: point-in-time namespace backups.
 * 
 * memoclaw snapshot create [--name <label>] [--namespace <ns>]
 * memoclaw snapshot list
 * memoclaw snapshot restore <name|id>
 * memoclaw snapshot delete <name|id>
 * 
 * Snapshots stored locally at ~/.memoclaw/snapshots/<timestamp>-<name>.json
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ParsedArgs } from '../args.js';
import { CONFIG_DIR, ensureConfigDir } from '../config.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, out, success, warn, table, outputWrite, progressBar, outputQuiet } from '../output.js';

const SNAPSHOTS_DIR = path.join(CONFIG_DIR, 'snapshots');

function ensureSnapshotsDir() {
  ensureConfigDir();
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

interface SnapshotMeta {
  name: string;
  timestamp: string;
  namespace: string | null;
  count: number;
  file: string;
}

/** List snapshot files with metadata */
function listSnapshots(): SnapshotMeta[] {
  ensureSnapshotsDir();
  const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.json')).sort();
  const snapshots: SnapshotMeta[] = [];

  for (const file of files) {
    try {
      const fullPath = path.join(SNAPSHOTS_DIR, file);
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      snapshots.push({
        name: data.name || file.replace('.json', ''),
        timestamp: data.exported_at || data.timestamp || '',
        namespace: data.namespace || null,
        count: data.count || (data.memories?.length ?? 0),
        file,
      });
    } catch {
      // skip corrupted files
    }
  }
  return snapshots;
}

/** Find a snapshot by name or partial filename */
function findSnapshot(query: string): SnapshotMeta | null {
  const all = listSnapshots();
  // Exact name match first
  const byName = all.find(s => s.name === query);
  if (byName) return byName;
  // Partial file match
  const byFile = all.find(s => s.file.includes(query));
  return byFile || null;
}

export async function cmdSnapshot(subcmd: string | undefined, rest: string[], opts: ParsedArgs) {
  const sub = subcmd || 'list';

  switch (sub) {
    case 'create': {
      const name = opts.name || rest[0] || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const namespace = opts.namespace || undefined;

      // Export all memories (same logic as cmdExport)
      const params = new URLSearchParams();
      if (namespace) params.set('namespace', namespace);
      params.set('limit', '1000');
      let offset = 0;
      const allMemories: any[] = [];

      while (true) {
        params.set('offset', String(offset));
        const result = await request('GET', `/v1/memories?${params}`) as any;
        const memories = result.memories || result.data || [];
        allMemories.push(...memories);
        if (memories.length < 1000) break;
        offset += 1000;
        if (!outputQuiet) process.stderr.write(`${c.dim}Fetching... ${allMemories.length} memories${c.reset}\r`);
      }

      const snapshotData = {
        version: 1,
        name,
        namespace: namespace || null,
        exported_at: new Date().toISOString(),
        count: allMemories.length,
        memories: allMemories,
      };

      ensureSnapshotsDir();
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '-');
      const filename = `${ts}-${sanitizedName}.json`;
      const filepath = path.join(SNAPSHOTS_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(snapshotData, null, 2));

      const sizeKB = Math.round(fs.statSync(filepath).size / 1024);

      if (outputJson) {
        out({ name, file: filename, count: allMemories.length, namespace: namespace || null, size_kb: sizeKB });
      } else {
        success(`Snapshot "${c.cyan}${name}${c.reset}" created — ${allMemories.length} memories (${sizeKB} KB)`);
        outputWrite(`  ${c.dim}${filepath}${c.reset}`);
      }
      break;
    }

    case 'list': {
      const snapshots = listSnapshots();

      if (snapshots.length === 0) {
        if (outputJson) {
          out({ snapshots: [], count: 0 });
        } else {
          outputWrite(`${c.dim}No snapshots found. Create one with: memoclaw snapshot create${c.reset}`);
        }
        return;
      }

      if (outputJson) {
        out({ snapshots, count: snapshots.length });
        return;
      }

      const rows = snapshots.map(s => ({
        name: s.name,
        date: s.timestamp ? new Date(s.timestamp).toLocaleString() : '—',
        memories: String(s.count),
        namespace: s.namespace || '(all)',
        size: Math.round(fs.statSync(path.join(SNAPSHOTS_DIR, s.file)).size / 1024) + ' KB',
      }));

      table(rows, [
        { key: 'name', label: 'NAME', width: 24 },
        { key: 'date', label: 'DATE', width: 22 },
        { key: 'memories', label: 'MEMORIES', width: 10 },
        { key: 'namespace', label: 'NAMESPACE', width: 16 },
        { key: 'size', label: 'SIZE', width: 10 },
      ]);
      outputWrite(`\n${c.dim}${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''}${c.reset}`);
      break;
    }

    case 'restore': {
      const query = rest[0];
      if (!query) throw new Error('Usage: memoclaw snapshot restore <name>');

      const snapshot = findSnapshot(query);
      if (!snapshot) throw new Error(`Snapshot "${query}" not found. Run "memoclaw snapshot list" to see available snapshots.`);

      const filepath = path.join(SNAPSHOTS_DIR, snapshot.file);
      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      const memories = data.memories || [];

      if (memories.length === 0) {
        warn('Snapshot contains no memories');
        return;
      }

      // Import memories in batches (same logic as cmdImport)
      const BATCH_SIZE = 100;
      let imported = 0;
      let failed = 0;

      for (let i = 0; i < memories.length; i += BATCH_SIZE) {
        const batch = memories.slice(i, i + BATCH_SIZE);
        const batchBody = batch.map((mem: any) => {
          const entry: Record<string, any> = { content: mem.content };
          if (mem.importance !== undefined) entry.importance = mem.importance;
          if (mem.metadata) entry.metadata = mem.metadata;
          if (mem.namespace) entry.namespace = mem.namespace;
          if (mem.memory_type) entry.memory_type = mem.memory_type;
          if (mem.session_id) entry.session_id = mem.session_id;
          if (mem.agent_id) entry.agent_id = mem.agent_id;
          if (mem.expires_at) entry.expires_at = mem.expires_at;
          if (mem.pinned !== undefined) entry.pinned = mem.pinned;
          if (mem.immutable !== undefined) entry.immutable = mem.immutable;
          return entry;
        });

        try {
          await request('POST', '/v1/store/batch', { memories: batchBody });
          imported += batch.length;
        } catch {
          // Fall back to individual stores
          for (const mem of batch) {
            try {
              const body: Record<string, any> = { content: mem.content };
              if (mem.importance !== undefined) body.importance = mem.importance;
              if (mem.metadata) body.metadata = mem.metadata;
              if (mem.namespace) body.namespace = mem.namespace;
              await request('POST', '/v1/store', body);
              imported++;
            } catch {
              failed++;
            }
          }
        }

        if (!outputQuiet) {
          process.stderr.write(`\r  ${progressBar(imported + failed, memories.length)}`);
        }
      }

      if (!outputQuiet) process.stderr.write('\n');

      if (outputJson) {
        out({ restored: imported, failed, total: memories.length, snapshot: snapshot.name });
      } else {
        success(`Restored ${imported}/${memories.length} memories from "${c.cyan}${snapshot.name}${c.reset}"${failed ? ` (${c.red}${failed} failed${c.reset})` : ''}`);
      }
      break;
    }

    case 'delete':
    case 'rm': {
      const query = rest[0];
      if (!query) throw new Error('Usage: memoclaw snapshot delete <name>');

      const snapshot = findSnapshot(query);
      if (!snapshot) throw new Error(`Snapshot "${query}" not found. Run "memoclaw snapshot list" to see available snapshots.`);

      const filepath = path.join(SNAPSHOTS_DIR, snapshot.file);
      fs.unlinkSync(filepath);

      if (outputJson) {
        out({ name: snapshot.name, file: snapshot.file, action: 'deleted' });
      } else {
        success(`Snapshot "${c.cyan}${snapshot.name}${c.reset}" deleted`);
      }
      break;
    }

    default:
      throw new Error(`Usage: memoclaw snapshot <create|list|restore|delete> [args]\n\n  create [--name <label>] [--namespace <ns>]   Create a snapshot\n  list                                          List all snapshots\n  restore <name>                                Restore from snapshot\n  delete <name>                                 Delete a snapshot`);
  }
}
