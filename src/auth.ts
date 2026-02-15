/**
 * Authentication and wallet management
 */

import { x402Client } from '@x402/core/client';
import { x402HTTPClient } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import { c } from './colors.js';
import { PRIVATE_KEY } from './config.js';

function ensureAuth() {
  if (!PRIVATE_KEY) {
    console.error(`${c.red}Error:${c.reset} MEMOCLAW_PRIVATE_KEY environment variable required`);
    console.error(`${c.dim}Set it with: export MEMOCLAW_PRIVATE_KEY=0x...${c.reset}`);
    process.exit(1);
  }
}

let _account: ReturnType<typeof privateKeyToAccount> | null = null;
export function getAccount() {
  if (!_account) {
    ensureAuth();
    _account = privateKeyToAccount(PRIVATE_KEY);
  }
  return _account;
}

export const account = new Proxy({} as ReturnType<typeof privateKeyToAccount>, {
  get(_, prop) { return (getAccount() as any)[prop]; }
});

let _x402Client: x402HTTPClient | null = null;
export function getX402Client() {
  if (!_x402Client) {
    const signer = toClientEvmSigner(account);
    const coreClient = new x402Client()
      .register('eip155:*', new ExactEvmScheme(signer));
    _x402Client = new x402HTTPClient(coreClient);
  }
  return _x402Client;
}

export async function getWalletAuthHeader(): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `memoclaw-auth:${timestamp}`;
  const signature = await account.signMessage({ message });
  return `${account.address}:${timestamp}:${signature}`;
}
