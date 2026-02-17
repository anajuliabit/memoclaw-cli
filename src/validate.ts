/**
 * Shared validation helpers
 */

export const MAX_CONTENT_LENGTH = 8192;

export function validateContentLength(content: string, label = 'Content') {
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`${label} exceeds the ${MAX_CONTENT_LENGTH} character limit (got ${content.length} chars)`);
  }
}

export function validateImportance(value: string): number {
  const n = parseFloat(value);
  if (isNaN(n) || n < 0 || n > 1) {
    throw new Error(`Importance must be a number between 0 and 1 (got "${value}")`);
  }
  return n;
}
