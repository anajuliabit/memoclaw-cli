/**
 * Config and init commands
 */

import * as fs from 'fs';
import yaml from 'js-yaml';
import { privateKeyToAccount } from 'viem/accounts';
import type { ParsedArgs } from '../args.js';
import { c } from '../colors.js';
import { API_URL, PRIVATE_KEY, DEFAULT_NAMESPACE, DEFAULT_TIMEOUT, CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_JSON, ensureConfigDir } from '../config.js';
import { getAccount } from '../auth.js';
import { outputJson, out, outputWrite, outputError, success, info } from '../output.js';

export async function cmdInit(opts: ParsedArgs) {
  const configPath = CONFIG_FILE_JSON;

  if (fs.existsSync(configPath) && !opts.force) {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    outputError(`${c.yellow}⚠${c.reset} Config already exists at ${c.cyan}${configPath}${c.reset}`);
    outputError(`  Wallet: ${c.dim}${existing.address || '(unknown)'}${c.reset}`);
    outputError(`  Use ${c.bold}--force${c.reset} to overwrite.`);
    process.exit(1);
  }

  const { generatePrivateKey } = await import('viem/accounts');
  const privateKey = generatePrivateKey();
  const newAccount = privateKeyToAccount(privateKey);

  const apiUrl = opts.url || 'https://api.memoclaw.com';

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const config = {
    privateKey: privateKey,
    address: newAccount.address,
    url: apiUrl,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });

  if (outputJson) {
    out({ address: newAccount.address, url: apiUrl, configPath });
  } else {
    outputWrite('');
    outputWrite(`${c.green}✓${c.reset} ${c.bold}MemoClaw initialized!${c.reset}`);
    outputWrite('');
    outputWrite(`  ${c.bold}Wallet:${c.reset}  ${c.cyan}${newAccount.address}${c.reset}`);
    outputWrite(`  ${c.bold}API:${c.reset}     ${c.dim}${apiUrl}${c.reset}`);
    outputWrite(`  ${c.bold}Config:${c.reset}  ${c.dim}${configPath}${c.reset}`);
    outputWrite('');
    outputWrite(`  Your wallet is your identity. No signup needed.`);
    outputWrite(`  You get ${c.bold}100 free API calls${c.reset}, then x402 micropayments.`);
    outputWrite('');
    outputWrite(`  ${c.dim}Try: memoclaw store "Hello, MemoClaw!"${c.reset}`);
  }
}

export async function cmdConfig(subcmd: string, rest: string[]) {
  if (subcmd === 'init') {
    ensureConfigDir();
    const sampleConfig = {
      url: process.env.MEMOCLAW_URL || 'https://api.memoclaw.com',
      namespace: process.env.MEMOCLAW_NAMESPACE || '',
      timeout: process.env.MEMOCLAW_TIMEOUT ? parseInt(process.env.MEMOCLAW_TIMEOUT) : 30,
    };

    const configPath = CONFIG_FILE;

    fs.writeFileSync(configPath, yaml.dump(sampleConfig, { indent: 2 }), { mode: 0o600 });
    success(`Config file created at ${c.cyan}${configPath}${c.reset}`);
    outputWrite(`${c.dim}Edit this file and remove the privateKey line (set via MEMOCLAW_PRIVATE_KEY env var)${c.reset}`);
    return;
  }

  if (subcmd === 'path') {
    outputWrite(CONFIG_FILE);
    return;
  }

  if (subcmd === 'show' || !subcmd) {
    const config: Record<string, string> = {
      MEMOCLAW_URL: API_URL,
      MEMOCLAW_PRIVATE_KEY: PRIVATE_KEY ? `${PRIVATE_KEY.slice(0, 6)}…${PRIVATE_KEY.slice(-4)}` : '(not set)',
      MEMOCLAW_NAMESPACE: DEFAULT_NAMESPACE || '(not set)',
      MEMOCLAW_TIMEOUT: `${DEFAULT_TIMEOUT}s`,
      NO_COLOR: process.env.NO_COLOR || '(not set)',
      DEBUG: process.env.DEBUG || '(not set)',
    };
    if (outputJson) {
      out(config);
    } else {
      outputWrite(`${c.bold}MemoClaw Configuration${c.reset}`);
      outputWrite(`${c.dim}${'─'.repeat(50)}${c.reset}`);
      for (const [key, val] of Object.entries(config)) {
        const isSet = !val.includes('not set');
        outputWrite(`  ${c.cyan}${key.padEnd(24)}${c.reset} ${isSet ? val : `${c.dim}${val}${c.reset}`}`);
      }
      outputWrite(`\n${c.dim}Set via environment variables or .env file${c.reset}`);
    }
  } else if (subcmd === 'check') {
    const issues: string[] = [];
    if (!PRIVATE_KEY) issues.push('MEMOCLAW_PRIVATE_KEY is not set');
    else if (!PRIVATE_KEY.startsWith('0x')) issues.push('MEMOCLAW_PRIVATE_KEY should start with 0x');
    else if (PRIVATE_KEY.length !== 66) issues.push(`MEMOCLAW_PRIVATE_KEY has wrong length (${PRIVATE_KEY.length}, expected 66)`);

    // Test API connectivity
    let apiReachable = false;
    let apiError = '';
    try {
      const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
      apiReachable = res.ok;
      if (!res.ok) apiError = `HTTP ${res.status}`;
    } catch (e: any) {
      apiError = e.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNREFUSED'
        ? 'Connection refused' : (e.message || 'Unknown error');
    }
    if (!apiReachable) issues.push(`Cannot reach API at ${API_URL} (${apiError})`);

    if (outputJson) {
      out({ valid: issues.length === 0, issues, apiReachable });
    } else {
      if (issues.length === 0) {
        success('Configuration looks good!');
        try {
          const acct = getAccount();
          info(`Wallet address: ${acct.address}`);
        } catch {}
        success(`API reachable at ${c.dim}${API_URL}${c.reset}`);
      } else {
        for (const issue of issues) {
          outputWrite(`${c.red}✗${c.reset} ${issue}`);
        }
      }
    }
  } else {
    throw new Error('Usage: config [show|check|init|path]');
  }
}
