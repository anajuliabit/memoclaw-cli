import { describe, test, expect } from 'bun:test';
import { parseDate, filterByDateRange } from '../src/dates';

describe('parseDate', () => {
  test('parses ISO 8601 date', () => {
    const d = parseDate('2025-06-15');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(5); // 0-indexed
    expect(d!.getDate()).toBe(15);
  });

  test('parses ISO 8601 datetime', () => {
    const d = parseDate('2025-06-15T12:30:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe('2025-06-15T12:30:00.000Z');
  });

  test('parses relative hours', () => {
    const now = Date.now();
    const d = parseDate('2h');
    expect(d).toBeInstanceOf(Date);
    // Should be roughly 2 hours ago (within 5s tolerance)
    const diff = now - d!.getTime();
    expect(diff).toBeGreaterThan(2 * 60 * 60 * 1000 - 5000);
    expect(diff).toBeLessThan(2 * 60 * 60 * 1000 + 5000);
  });

  test('parses relative days', () => {
    const now = Date.now();
    const d = parseDate('7d');
    expect(d).toBeInstanceOf(Date);
    const diff = now - d!.getTime();
    expect(diff).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 5000);
    expect(diff).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 5000);
  });

  test('parses relative weeks', () => {
    const d = parseDate('2w');
    expect(d).toBeInstanceOf(Date);
    const diff = Date.now() - d!.getTime();
    expect(Math.round(diff / (24 * 60 * 60 * 1000))).toBe(14);
  });

  test('parses relative months', () => {
    const d = parseDate('1mo');
    expect(d).toBeInstanceOf(Date);
    const diff = Date.now() - d!.getTime();
    expect(Math.round(diff / (24 * 60 * 60 * 1000))).toBe(30);
  });

  test('parses relative years', () => {
    const d = parseDate('1y');
    expect(d).toBeInstanceOf(Date);
    const diff = Date.now() - d!.getTime();
    expect(Math.round(diff / (24 * 60 * 60 * 1000))).toBe(365);
  });

  test('parses relative minutes', () => {
    const d = parseDate('30m');
    expect(d).toBeInstanceOf(Date);
    const diff = Date.now() - d!.getTime();
    expect(diff).toBeGreaterThan(29 * 60 * 1000);
    expect(diff).toBeLessThan(31 * 60 * 1000);
  });

  test('returns null for invalid input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('abc')).toBeNull();
  });

  test('returns null for empty/undefined input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null as any)).toBeNull();
    expect(parseDate(undefined as any)).toBeNull();
  });
});

describe('filterByDateRange', () => {
  const items = [
    { id: '1', created_at: '2025-01-01T00:00:00Z' },
    { id: '2', created_at: '2025-06-15T00:00:00Z' },
    { id: '3', created_at: '2025-12-31T00:00:00Z' },
    { id: '4', created_at: null },
  ];

  test('filters by since', () => {
    const result = filterByDateRange(items, 'created_at', new Date('2025-06-01'));
    expect(result.map(i => i.id)).toEqual(['2', '3', '4']);
  });

  test('filters by until', () => {
    const result = filterByDateRange(items, 'created_at', null, new Date('2025-06-30'));
    expect(result.map(i => i.id)).toEqual(['1', '2', '4']);
  });

  test('filters by both since and until', () => {
    const result = filterByDateRange(items, 'created_at', new Date('2025-03-01'), new Date('2025-09-01'));
    expect(result.map(i => i.id)).toEqual(['2', '4']);
  });

  test('returns all when no filters', () => {
    const result = filterByDateRange(items, 'created_at');
    expect(result).toHaveLength(4);
  });

  test('keeps items with null dates', () => {
    const result = filterByDateRange(items, 'created_at', new Date('2030-01-01'));
    expect(result.map(i => i.id)).toEqual(['4']);
  });
});
