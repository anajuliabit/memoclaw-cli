/**
 * HTTP request layer with free-tier + x402 payment fallback
 */

import { c } from './colors.js';
import { API_URL } from './config.js';
import { getWalletAuthHeader, getX402Client } from './auth.js';

let _timeoutMs = 30000;

export function setRequestTimeout(ms: number) {
  _timeoutMs = ms;
}

export function getRequestTimeout(): number {
  return _timeoutMs;
}

export async function request(method: string, path: string, body: any = null) {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const walletAuth = await getWalletAuthHeader();
  headers['x-wallet-auth'] = walletAuth;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), _timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to ${API_URL} — is the server running?`);
    }
    if (e.code === 'ENOTFOUND' || e.cause?.code === 'ENOTFOUND') {
      throw new Error(`DNS lookup failed for ${API_URL} — check your internet connection`);
    }
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${_timeoutMs / 1000}s`);
    }
    throw new Error(`Network error: ${e.message}`);
  }
  clearTimeout(timeoutId);

  const freeTierRemaining = res.headers.get('x-free-tier-remaining');
  if (freeTierRemaining !== null && process.env.DEBUG) {
    console.error(`${c.dim}Free tier remaining: ${freeTierRemaining}${c.reset}`);
  }

  if (res.status === 402) {
    const errorBody = await res.json();
    if (process.env.DEBUG) {
      console.error('=== 402 Response (switching to x402) ===');
      console.error('Headers:', Object.fromEntries(res.headers.entries()));
      console.error('Body:', JSON.stringify(errorBody, null, 2));
    }

    try {
      const client = getX402Client();
      const paymentRequired = client.getPaymentRequiredResponse(
        (name: string) => res.headers.get(name),
        errorBody
      );
      if (process.env.DEBUG) console.error('Payment required parsed:', JSON.stringify(paymentRequired, null, 2));

      const paymentPayload = await client.createPaymentPayload(paymentRequired);
      if (process.env.DEBUG) console.error('Payment payload created');

      const paymentHeaders = client.encodePaymentSignatureHeader(paymentPayload);
      if (process.env.DEBUG) console.error('Payment headers:', paymentHeaders);

      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...paymentHeaders },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (process.env.DEBUG) {
        console.error('=== Retry Response ===');
        console.error('Status:', res.status);
        if (res.status !== 200) {
          const retryBody = await res.clone().text();
          console.error('Body:', retryBody);
        }
      }
    } catch (paymentError: any) {
      if (process.env.DEBUG) console.error('x402 payment failed:', paymentError);
      throw new Error(
        `Free tier exhausted. Run \`memoclaw status\` to check usage, or visit memoclaw.com/pricing for paid plans.\n` +
        `${c.dim}(x402 payment failed: ${paymentError.message})${c.reset}`
      );
    }
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as any).error?.message || `HTTP ${res.status}`);
  }
  return data;
}
