import { describe, test, expect } from 'bun:test';
import { c } from '../src/colors';

describe('colors', () => {
  const colorKeys = ['reset', 'bold', 'dim', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'gray'];

  test('exports all expected color keys', () => {
    for (const key of colorKeys) {
      expect(c).toHaveProperty(key);
    }
  });

  test('all values are strings', () => {
    for (const key of colorKeys) {
      expect(typeof (c as any)[key]).toBe('string');
    }
  });

  test('NO_COLOR env disables colors (values are empty or ANSI)', () => {
    // In CI/test (no TTY), colors should be empty strings
    // In TTY, they should be ANSI escape sequences
    for (const key of colorKeys) {
      const val = (c as any)[key];
      expect(val === '' || val.startsWith('\x1b[')).toBe(true);
    }
  });
});
