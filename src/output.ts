/**
 * Output helpers: formatting, table, progress bar, etc.
 * 
 * Uses mutable module-level state configured by the main CLI entry point.
 */

import * as fs from 'fs';
import yaml from 'js-yaml';
import { c } from './colors.js';

// ─── Global Output State ─────────────────────────────────────────────────────

export let outputJson = false;
export let outputQuiet = false;
export let outputPretty = false;
export let outputFormat: 'json' | 'table' | 'csv' | 'tsv' | 'yaml' = 'table';
export let outputTruncate = 0;
export let outputFile: string | null = null;
export let noTruncate = false;
export let outputField: string | null = null;

/** Configure output state from parsed args (called once at startup) */
export function configureOutput(args: any) {
  outputJson = !!args.json;
  outputQuiet = !!args.quiet;
  outputPretty = !!args.pretty;

  if (args.field && args.field !== true) {
    outputField = String(args.field);
    outputJson = true;
  }

  if (args.format) {
    let fmt = String(args.format).toLowerCase();
    if (fmt === 'yml') fmt = 'yaml';
    if (fmt === 'json' || fmt === 'table' || fmt === 'csv' || fmt === 'tsv' || fmt === 'yaml') {
      outputFormat = fmt as typeof outputFormat;
    }
  }
  if (args.json) outputFormat = 'json';

  if (args.truncate != null && args.truncate !== true) {
    outputTruncate = parseInt(args.truncate);
  } else if (args.truncate === true) {
    outputTruncate = 80;
  }

  noTruncate = !!args.noTruncate;
  if (noTruncate) outputTruncate = 0;

  if (args.output) {
    outputFile = String(args.output);
    fs.writeFileSync(outputFile, '');
  }
}

// ─── Output Functions ────────────────────────────────────────────────────────

export function outputWrite(...parts: string[]) {
  const line = parts.join(' ');
  if (outputFile) {
    fs.appendFileSync(outputFile, line + '\n');
  } else {
    console.log(line);
  }
}

export function outputError(...parts: string[]) {
  const line = parts.join(' ');
  if (outputFile) {
    fs.appendFileSync(outputFile, line + '\n');
  } else {
    console.error(line);
  }
}

function extractField(data: any, field: string): any {
  const parts = field.split('.');
  let val = data;
  for (const p of parts) {
    if (val == null) return undefined;
    val = val[p];
  }
  return val;
}

export function out(data: any) {
  if (outputQuiet) return;
  if (outputField) {
    const val = extractField(data, outputField);
    if (val === undefined) return;
    if (typeof val === 'object') {
      outputWrite(JSON.stringify(val, outputPretty ? null : undefined, outputPretty ? 2 : undefined));
    } else {
      outputWrite(String(val));
    }
    return;
  }
  if (outputJson || outputFormat === 'json') {
    outputWrite(JSON.stringify(data, outputPretty ? null : undefined, outputPretty ? 2 : undefined));
  } else if (outputFormat === 'yaml') {
    outputWrite(yaml.dump(data, { indent: 2, lineWidth: 120 }));
  } else if (outputFormat === 'csv' || outputFormat === 'tsv') {
    const sep = outputFormat === 'tsv' ? '\t' : ',';
    if (Array.isArray(data)) {
      if (data.length === 0) return;
      const headers = Object.keys(data[0]);
      outputWrite(headers.join(sep));
      for (const row of data) {
        outputWrite(headers.map(h => {
          const val = row[h];
          const str = val === null || val === undefined ? '' : String(val);
          if (outputFormat === 'csv') {
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          }
          return str.replace(/\t/g, ' ').replace(/\n/g, ' ');
        }).join(sep));
      }
    } else if (typeof data === 'string') {
      outputWrite(data);
    } else {
      outputWrite(JSON.stringify(data, null, 2));
    }
  } else if (typeof data === 'string') {
    outputWrite(data);
  } else {
    outputWrite(JSON.stringify(data, null, 2));
  }
}

export function success(msg: string) {
  if (outputQuiet) return;
  if (outputJson) return;
  outputWrite(`${c.green}✓${c.reset} ${msg}`);
}

export function warn(msg: string) {
  outputError(`${c.yellow}⚠${c.reset} ${msg}`);
}

export function info(msg: string) {
  if (outputQuiet) return;
  if (outputJson) return;
  outputError(`${c.blue}ℹ${c.reset} ${msg}`);
}

export function table(rows: Record<string, any>[], columns?: { key: string; label: string; width?: number }[], opts?: { wide?: boolean }) {
  if (rows.length === 0) return;

  if (outputJson || outputFormat === 'json') {
    outputWrite(JSON.stringify(rows, null, 2));
    return;
  }

  if (outputFormat === 'yaml') {
    outputWrite(yaml.dump(rows, { indent: 2, lineWidth: 120 }));
    return;
  }

  if (outputFormat === 'csv' || outputFormat === 'tsv') {
    out(rows);
    return;
  }

  if (!columns) {
    columns = Object.keys(rows[0]).map(k => ({ key: k, label: k.toUpperCase() }));
  }

  const capWidth = opts?.wide ? 120 : 60;
  for (const col of columns) {
    if (!col.width) {
      col.width = Math.max(
        col.label.length,
        ...rows.map(r => String(r[col.key] ?? '').length)
      );
      col.width = Math.min(col.width, capWidth);
    }
  }

  const header = columns.map(col => col.label.padEnd(col.width!)).join('  ');
  outputWrite(`${c.bold}${header}${c.reset}`);
  outputWrite(`${c.dim}${columns.map(col => '─'.repeat(col.width!)).join('──')}${c.reset}`);

  for (const row of rows) {
    const line = columns!.map(col => {
      const val = String(row[col.key] ?? '');
      return val.length > col.width! ? val.slice(0, col.width! - 1) + '…' : val.padEnd(col.width!);
    }).join('  ');
    outputWrite(line);
  }
}

export function progressBar(current: number, total: number, width = 30): string {
  const pct = Math.min(current / total, 1);
  const filled = Math.round(pct * width);
  return `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(width - filled)}${c.reset} ${current}/${total}`;
}

export function truncate(text: string, width: number): string {
  if (width <= 0 || text.length <= width) return text;
  return text.slice(0, width - 1) + '…';
}

export async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk.toString());
  const text = chunks.join('').trim();
  return text || null;
}
