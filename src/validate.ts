/**
 * Shared validation helpers
 */

export const MAX_CONTENT_LENGTH = 8192;

export function validateContentLength(content: string, label = 'Content') {
  if (!content.trim()) {
    throw new Error(`${label} cannot be empty or whitespace-only`);
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`${label} exceeds the ${MAX_CONTENT_LENGTH} character limit (got ${content.length} chars)`);
  }
}

const BOOLEAN_LIKE = new Set(['true', 'false', 'yes', 'no', 'on', 'off']);

/**
 * Check if --importance was passed without a proper value (boolean-like).
 * Returns true if the value should be skipped (with a warning).
 */
export function warnIfBooleanImportance(value: any): boolean {
  if (value === true) {
    process.stderr.write(
      'Warning: --importance requires a numeric value (e.g. --importance 0.8). Flag ignored.\n'
    );
    return true;
  }
  if (typeof value === 'string' && BOOLEAN_LIKE.has(value.toLowerCase())) {
    process.stderr.write(
      `Warning: --importance received "${value}" but expects a number between 0 and 1 (e.g. --importance 0.8). Flag ignored.\n`
    );
    return true;
  }
  return false;
}

export function validateImportance(value: string): number {
  const n = parseFloat(value);
  if (isNaN(n) || n < 0 || n > 1) {
    throw new Error(
      `Importance must be a number between 0 and 1 (got "${value}")\n` +
      `Hint: --importance takes a numeric value, e.g. --importance 0.8`
    );
  }
  return n;
}
