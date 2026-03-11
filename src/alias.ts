/**
 * Alias resolution: maps @alias names to memory IDs.
 * Aliases stored locally in ~/.memoclaw/aliases.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_DIR, ensureConfigDir } from './config.js';

export interface AliasMap {
  [name: string]: string;
}

/** Override for testing — when set, used instead of CONFIG_DIR */
let _aliasFileOverride: string | null = null;

/** Set a custom aliases file path (for testing). Pass null to reset. */
export function setAliasFile(filePath: string | null): void {
  _aliasFileOverride = filePath;
}

function getAliasFile(): string {
  return _aliasFileOverride || path.join(CONFIG_DIR, 'aliases.json');
}

/** Load aliases from disk */
export function loadAliases(): AliasMap {
  const file = getAliasFile();
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch {}
  return {};
}

/** Save aliases to disk */
export function saveAliases(aliases: AliasMap): void {
  const file = getAliasFile();
  if (!_aliasFileOverride) ensureConfigDir();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(aliases, null, 2) + '\n');
}

/**
 * Resolve a value that may be an @alias reference.
 * Returns the memory ID if alias exists, or the original value if not an alias.
 */
export function resolveAlias(value: string): string {
  if (!value.startsWith('@')) return value;
  const name = value.slice(1);
  const aliases = loadAliases();
  if (aliases[name]) return aliases[name];
  return value; // pass through if alias not found
}
