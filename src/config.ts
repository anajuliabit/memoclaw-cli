/**
 * Configuration loading and management
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import yaml from 'js-yaml';

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
export const { version: VERSION } = _require('../package.json');

export const CONFIG_DIR = path.join(os.homedir(), '.memoclaw');
export const CONFIG_FILE_JSON = path.join(CONFIG_DIR, 'config.json');
export const CONFIG_FILE_YAML = path.join(CONFIG_DIR, 'config');
export const CONFIG_FILE = CONFIG_FILE_YAML;

export interface ConfigFile {
  url?: string;
  privateKey?: string;
  namespace?: string;
  timeout?: number;
}

/** Load persisted JSON config from ~/.memoclaw/config.json */
export function loadPersistedConfig(): { url?: string; privateKey?: string; namespace?: string } {
  try {
    if (fs.existsSync(CONFIG_FILE_JSON)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE_JSON, 'utf-8'));
    }
  } catch {}
  return {};
}

/** Load YAML/JSON config file */
export function loadConfigFile(): ConfigFile {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      if (CONFIG_FILE.endsWith('.json')) {
        return JSON.parse(content);
      }
      return yaml.load(content) as ConfigFile;
    }
  } catch (e: any) {
    if (process.env.DEBUG) {
      console.error(`Failed to load config: ${e.message}`);
    }
  }
  return {};
}

export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

const _persistedConfig = loadPersistedConfig();

export const API_URL = process.env.MEMOCLAW_URL || _persistedConfig.url || 'https://api.memoclaw.com';
export const PRIVATE_KEY = (process.env.MEMOCLAW_PRIVATE_KEY || _persistedConfig.privateKey) as `0x${string}`;
