/**
 * Date parsing utilities for --since and --until flags.
 * Supports ISO 8601 dates and relative shorthand: 1h, 7d, 2w, 1m, 1y
 */

const RELATIVE_RE = /^(\d+)(m|h|d|w|mo|y)$/i;

const UNIT_MS: Record<string, number> = {
  m:  60 * 1000,
  h:  60 * 60 * 1000,
  d:  24 * 60 * 60 * 1000,
  w:  7 * 24 * 60 * 60 * 1000,
  mo: 30 * 24 * 60 * 60 * 1000,
  y:  365 * 24 * 60 * 60 * 1000,
};

/**
 * Parse a date string into a Date object.
 * Accepts:
 *   - ISO 8601: "2025-01-01", "2025-01-01T12:00:00Z"
 *   - Relative: "1h" (1 hour ago), "7d" (7 days ago), "2w", "1mo", "1y"
 * Returns null if unparseable.
 */
export function parseDate(input: string): Date | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Try relative shorthand
  const match = trimmed.match(RELATIVE_RE);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const ms = UNIT_MS[unit];
    if (ms) {
      return new Date(Date.now() - amount * ms);
    }
  }

  // Try ISO 8601 / standard date parsing
  const ts = Date.parse(trimmed);
  if (!isNaN(ts)) {
    return new Date(ts);
  }

  return null;
}

/**
 * Filter an array of objects by date range.
 * @param items - Array of objects
 * @param dateKey - Key containing the date string (e.g. 'created_at')
 * @param since - Only items after this date
 * @param until - Only items before this date
 */
export function filterByDateRange<T extends Record<string, any>>(
  items: T[],
  dateKey: string,
  since?: Date | null,
  until?: Date | null,
): T[] {
  if (!since && !until) return items;

  return items.filter(item => {
    const val = item[dateKey];
    if (!val) return true; // Keep items without a date
    const itemDate = new Date(val);
    if (isNaN(itemDate.getTime())) return true;
    if (since && itemDate < since) return false;
    if (until && itemDate > until) return false;
    return true;
  });
}
