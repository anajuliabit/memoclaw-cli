/**
 * HTTP request layer with free-tier + x402 payment fallback
 * Includes retry logic with exponential backoff for transient errors.
 */

import { c } from './colors.js';
import { API_URL } from './config.js';
import { getWalletAuthHeader, getX402Client } from './auth.js';

let _timeoutMs = 30000;
let _maxRetries = 3;

export function setRequestTimeout(ms: number) {
  _timeoutMs = ms;
}

export function getRequestTimeout(): number {
  return _timeoutMs;
}

export function setMaxRetries(n: number) {
  _maxRetries = Math.max(0, Math.floor(n));
}

export function getMaxRetries(): number {
  return _maxRetries;
}

/** Check if an error is retryable (transient) */
function isRetryableError(err: any): boolean {
  const code = err.code || err.cause?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE' ||
         code === 'ECONNREFUSED' || err.name === 'AbortError';
}

/** Check if an HTTP status is retryable */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

/** Sleep with jitter for exponential backoff */
function backoffMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 16000);
  const jitter = Math.random() * base * 0.3;
  return base + jitter;
}

/** Parse Retry-After header (seconds or HTTP-date) */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = parseInt(header, 10);
  if (!isNaN(secs)) return secs * 1000;
  const date = Date.parse(header);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export async function request(method: string, path: string, body: any = null) {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const walletAuth = await getWalletAuthHeader();
  headers['x-wallet-auth'] = walletAuth;

  let res!: Response;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= _maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffMs(attempt - 1);
      if (process.env.DEBUG) {
        console.error(`${c.dim}Retry ${attempt}/${_maxRetries} after ${Math.round(delay)}ms${c.reset}`);
      }
      await new Promise(r => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timeoutId = _timeoutMs > 0
      ? setTimeout(() => controller.abort(), _timeoutMs)
      : undefined;

    try {
      res = await fetch(url, { ...options, headers, signal: controller.signal });
      if (timeoutId) clearTimeout(timeoutId);
    } catch (e: any) {
      if (timeoutId) clearTimeout(timeoutId);

      // DNS errors are not retryable
      if (e.code === 'ENOTFOUND' || e.cause?.code === 'ENOTFOUND') {
        throw new Error(`DNS lookup failed for ${API_URL} — check your internet connection`);
      }

      if (isRetryableError(e) && attempt < _maxRetries) {
        lastError = e;
        continue;
      }

      if (e.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to ${API_URL} — is the server running?`);
      }
      if (e.name === 'AbortError') {
        throw new Error(`Request timed out after ${_timeoutMs / 1000}s`);
      }
      throw new Error(`Network error: ${e.message}`);
    }

    // Retry on 5xx or 429
    if (isRetryableStatus(res.status) && attempt < _maxRetries) {
      // Respect Retry-After header for 429
      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        if (retryAfter && retryAfter < 60000) {
          if (process.env.DEBUG) {
            console.error(`${c.dim}429 Too Many Requests — waiting ${Math.round(retryAfter)}ms (Retry-After)${c.reset}`);
          }
          await new Promise(r => setTimeout(r, retryAfter));
        }
      }
      if (process.env.DEBUG) {
        console.error(`${c.dim}HTTP ${res.status} — will retry${c.reset}`);
      }
      continue;
    }

    // Success or non-retryable status — break out of retry loop
    break;
  }

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

      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), _timeoutMs);
      try {
        res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'x-wallet-auth': walletAuth, ...paymentHeaders },
          body: body ? JSON.stringify(body) : undefined,
          signal: retryController.signal,
        });
      } catch (retryErr: any) {
        clearTimeout(retryTimeoutId);
        if (retryErr.name === 'AbortError') {
          throw new Error(`x402 payment retry timed out after ${_timeoutMs / 1000}s`);
        }
        throw retryErr;
      }
      clearTimeout(retryTimeoutId);

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

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned non-JSON response (HTTP ${res.status}).\n` +
      `This usually means the API is down or behind a proxy.\n` +
      `Response: ${text.slice(0, 200)}`
    );
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
  return data;
}
