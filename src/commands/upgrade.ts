/**
 * Upgrade command — check for and install CLI updates
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { c } from '../colors.js';
import { VERSION, CONFIG_DIR, ensureConfigDir } from '../config.js';
import { outputJson, out, outputWrite, success, info, warn } from '../output.js';
import type { ParsedArgs } from '../args.js';

const CACHE_FILE = path.join(CONFIG_DIR, 'last-version-check.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface VersionCheckResult {
  current: string;
  latest: string;
  updateAvailable: boolean;
  latestPublishedAt?: string;
}

/** Fetch latest version from npm registry */
export async function fetchLatestVersion(): Promise<{ version: string; publishedAt?: string }> {
  const res = await fetch('https://registry.npmjs.org/memoclaw/latest');
  if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
  const data = await res.json() as any;
  return {
    version: data.version,
    publishedAt: data.time?.[data.version] || undefined,
  };
}

/** Compare two semver strings. Returns -1, 0, or 1. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/** Read cached version check */
function readCache(): { version: string; checkedAt: number } | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      if (data.version && data.checkedAt) return data;
    }
  } catch {}
  return null;
}

/** Write cache */
function writeCache(version: string) {
  try {
    ensureConfigDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ version, checkedAt: Date.now() }));
  } catch {}
}

/** Check for updates (uses cache if fresh) */
export async function checkForUpdate(forceRefresh = false): Promise<VersionCheckResult> {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
      return {
        current: VERSION,
        latest: cached.version,
        updateAvailable: compareSemver(VERSION, cached.version) < 0,
      };
    }
  }

  const { version: latest, publishedAt } = await fetchLatestVersion();
  writeCache(latest);

  return {
    current: VERSION,
    latest,
    updateAvailable: compareSemver(VERSION, latest) < 0,
    latestPublishedAt: publishedAt,
  };
}

/** Install the latest version */
export function installUpdate(): { success: boolean; output: string } {
  try {
    const output = execSync('npm install -g memoclaw@latest 2>&1', {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    return { success: true, output: output.trim() };
  } catch (err: any) {
    return { success: false, output: err.message || String(err) };
  }
}

export async function cmdUpgrade(opts: ParsedArgs) {
  const checkOnly = !!opts.check;
  const autoYes = !!opts.yes || !!opts.force;

  let result: VersionCheckResult;
  try {
    result = await checkForUpdate(true);
  } catch (err: any) {
    if (outputJson) {
      out({ error: `Failed to check for updates: ${err.message}` });
    } else {
      outputWrite(`${c.red}Error:${c.reset} Failed to check for updates: ${err.message}`);
    }
    process.exit(1);
    return; // unreachable, helps TS
  }

  if (outputJson && checkOnly) {
    out(result);
    return;
  }

  if (!result.updateAvailable) {
    if (outputJson) {
      out(result);
    } else {
      success(`Already up to date (v${result.current})`);
    }
    return;
  }

  // Update is available
  if (checkOnly) {
    if (outputJson) {
      out(result);
    } else {
      outputWrite(`${c.yellow}Update available:${c.reset} v${result.current} → v${c.green}${result.latest}${c.reset}`);
      outputWrite(`Run ${c.dim}memoclaw upgrade${c.reset} to install.`);
    }
    return;
  }

  // Prompt or auto-install
  if (!autoYes && process.stdin.isTTY) {
    outputWrite(`${c.yellow}Update available:${c.reset} v${result.current} → v${c.green}${result.latest}${c.reset}`);
    process.stdout.write(`Install now? [Y/n] `);

    const answer = await new Promise<string>((resolve) => {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.once('data', (chunk) => {
        data = chunk.toString().trim();
        resolve(data);
      });
      // Handle Ctrl+C / EOF
      process.stdin.once('end', () => resolve('n'));
    });

    if (answer.toLowerCase() === 'n') {
      info('Upgrade cancelled.');
      return;
    }
  } else if (!autoYes) {
    // Non-interactive, no --yes flag
    if (outputJson) {
      out({ ...result, message: 'Update available. Run with --yes to auto-install.' });
    } else {
      outputWrite(`${c.yellow}Update available:${c.reset} v${result.current} → v${c.green}${result.latest}${c.reset}`);
      outputWrite(`Run ${c.dim}memoclaw upgrade --yes${c.reset} to install non-interactively.`);
    }
    return;
  }

  // Do the install
  if (!outputJson) {
    outputWrite(`${c.dim}Installing memoclaw@${result.latest}...${c.reset}`);
  }

  const installResult = installUpdate();

  if (installResult.success) {
    if (outputJson) {
      out({ ...result, installed: true, message: `Updated to v${result.latest}` });
    } else {
      success(`Updated to v${result.latest}`);
    }
  } else {
    if (outputJson) {
      out({ ...result, installed: false, error: installResult.output });
    } else {
      outputWrite(`${c.red}Error:${c.reset} Failed to install update.`);
      outputWrite(`${c.dim}${installResult.output}${c.reset}`);
      outputWrite(`\nTry manually: ${c.cyan}npm install -g memoclaw@latest${c.reset}`);
    }
    process.exit(1);
  }
}
