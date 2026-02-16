/**
 * Config and init commands
 */

import * as fs from 'fs';
import yaml from 'js-yaml';
import { privateKeyToAccount } from 'viem/accounts';
import type { ParsedArgs } from '../args.js';
import { c } from '../colors.js';
import { API_URL, PRIVATE_KEY, CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_JSON, ensureConfigDir } from '../config.js';
import { getAccount } from '../auth.js';
import { outputJson, out, success, info } from '../output.js';

export async function cmdInit(opts: ParsedArgs) {
  const configPath = CONFIG_FILE_JSON;

  if (fs.existsSync(configPath) && !opts.force) {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.error(`${c.yellow}⚠${c.reset} Config already exists at ${c.cyan}${configPath}${c.reset}`);
    console.error(`  Wallet: ${c.dim}${existing.address || '(unknown)'}${c.reset}`);
    console.error(`  Use ${c.bold}--force${c.reset} to overwrite.`);
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
    console.log();
    console.log(`${c.green}✓${c.reset} ${c.bold}MemoClaw initialized!${c.reset}`);
    console.log();
    console.log(`  ${c.bold}Wallet:${c.reset}  ${c.cyan}${newAccount.address}${c.reset}`);
    console.log(`  ${c.bold}API:${c.reset}     ${c.dim}${apiUrl}${c.reset}`);
    console.log(`  ${c.bold}Config:${c.reset}  ${c.dim}${configPath}${c.reset}`);
    console.log();
    console.log(`  Your wallet is your identity. No signup needed.`);
    console.log(`  You get ${c.bold}100 free API calls${c.reset}, then x402 micropayments.`);
    console.log();
    console.log(`  ${c.dim}Try: memoclaw store "Hello, MemoClaw!"${c.reset}`);
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

    fs.writeFileSync(configPath, yaml.dump(sampleConfig, { indent: 2 }));
    success(`Config file created at ${c.cyan}${configPath}${c.reset}`);
    console.log(`${c.dim}Edit this file and remove the privateKey line (set via MEMOCLAW_PRIVATE_KEY env var)${c.reset}`);
    return;
  }

  if (subcmd === 'path') {
    console.log(CONFIG_FILE);
    return;
  }

  if (subcmd === 'show' || !subcmd) {
    const config: Record<string, string> = {
      MEMOCLAW_URL: API_URL,
      MEMOCLAW_PRIVATE_KEY: PRIVATE_KEY ? `${PRIVATE_KEY.slice(0, 6)}…${PRIVATE_KEY.slice(-4)}` : '(not set)',
      NO_COLOR: process.env.NO_COLOR || '(not set)',
      DEBUG: process.env.DEBUG || '(not set)',
    };
    if (outputJson) {
      out(config);
    } else {
      console.log(`${c.bold}MemoClaw Configuration${c.reset}`);
      console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
      for (const [key, val] of Object.entries(config)) {
        const isSet = !val.includes('not set');
        console.log(`  ${c.cyan}${key.padEnd(24)}${c.reset} ${isSet ? val : `${c.dim}${val}${c.reset}`}`);
      }
      console.log(`\n${c.dim}Set via environment variables or .env file${c.reset}`);
    }
  } else if (subcmd === 'check') {
    const issues: string[] = [];
    if (!PRIVATE_KEY) issues.push('MEMOCLAW_PRIVATE_KEY is not set');
    else if (!PRIVATE_KEY.startsWith('0x')) issues.push('MEMOCLAW_PRIVATE_KEY should start with 0x');
    else if (PRIVATE_KEY.length !== 66) issues.push(`MEMOCLAW_PRIVATE_KEY has wrong length (${PRIVATE_KEY.length}, expected 66)`);

    if (outputJson) {
      out({ valid: issues.length === 0, issues });
    } else {
      if (issues.length === 0) {
        success('Configuration looks good!');
        try {
          const acct = getAccount();
          info(`Wallet address: ${acct.address}`);
        } catch {}
      } else {
        for (const issue of issues) {
          console.log(`${c.red}✗${c.reset} ${issue}`);
        }
      }
    }
  } else {
    throw new Error('Usage: config [show|check|init|path]');
  }
}
