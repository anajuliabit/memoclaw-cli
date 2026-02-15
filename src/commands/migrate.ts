import * as fs from 'fs';
import * as path from 'path';
import type { ParsedArgs } from '../args.js';
import { request } from '../http.js';
import { c } from '../colors.js';
import { outputJson, outputQuiet, out, success, progressBar } from '../output.js';

export async function cmdMigrate(targetPath: string, opts: ParsedArgs) {
  if (!targetPath) {
    throw new Error('Path required. Usage: memoclaw migrate <path-to-file-or-directory>');
  }

  const resolvedPath = path.resolve(targetPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${resolvedPath}`);
  }

  const mdFiles: { filepath: string; filename: string }[] = [];
  const stat = fs.statSync(resolvedPath);

  const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', '.output',
    '__pycache__', '.venv', 'venv', 'env', '.env', '.tox',
    '.cache', '.tmp', 'tmp', 'coverage', '.nyc_output',
    'vendor', 'target', '.gradle', '.mvn',
    'skills', '.openclaw', '.clawd',
  ]);

  if (stat.isDirectory()) {
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) walk(full);
        } else if (entry.name.endsWith('.md')) {
          mdFiles.push({ filepath: full, filename: path.relative(resolvedPath, full) });
        }
      }
    };
    walk(resolvedPath);
  } else if (resolvedPath.endsWith('.md')) {
    mdFiles.push({ filepath: resolvedPath, filename: path.basename(resolvedPath) });
  } else {
    throw new Error('Path must be a .md file or a directory containing .md files');
  }

  if (mdFiles.length === 0) {
    throw new Error('No .md files found');
  }

  if (!outputQuiet) {
    console.log(`${c.blue}ℹ${c.reset} Found ${c.bold}${mdFiles.length}${c.reset} markdown file${mdFiles.length !== 1 ? 's' : ''}`);
  }

  const BATCH_SIZE = 5;
  let totalCreated = 0;
  let totalDeduplicated = 0;
  let totalErrors = 0;
  let filesProcessed = 0;

  for (let i = 0; i < mdFiles.length; i += BATCH_SIZE) {
    const batch = mdFiles.slice(i, i + BATCH_SIZE);
    const files = batch.map(f => ({
      filename: f.filename,
      content: fs.readFileSync(f.filepath, 'utf-8'),
    }));

    try {
      const result = await request('POST', '/v1/migrate', { files }) as any;
      totalCreated += result.memories_created || 0;
      totalDeduplicated += result.memories_deduplicated || 0;
      filesProcessed += result.files_processed || 0;
      if (result.errors) totalErrors += result.errors.length;

      if (!outputQuiet && !outputJson) {
        process.stderr.write(`\r  ${progressBar(Math.min(i + BATCH_SIZE, mdFiles.length), mdFiles.length)}`);
      }
    } catch (e: any) {
      totalErrors += batch.length;
      if (!outputQuiet) {
        console.error(`\n${c.red}Error:${c.reset} Batch failed: ${e.message}`);
      }
    }
  }

  if (!outputQuiet && !outputJson) process.stderr.write('\n');

  if (outputJson) {
    out({ files_found: mdFiles.length, files_processed: filesProcessed, memories_created: totalCreated, memories_deduplicated: totalDeduplicated, errors: totalErrors });
  } else {
    console.log();
    success(`Migration complete!`);
    console.log(`  Files processed:      ${c.cyan}${filesProcessed}${c.reset}`);
    console.log(`  Memories created:     ${c.green}${totalCreated}${c.reset}`);
    console.log(`  Deduplicated:         ${c.dim}${totalDeduplicated}${c.reset}`);
    if (totalErrors > 0) {
      console.log(`  Errors:               ${c.red}${totalErrors}${c.reset}`);
    }
  }
}
