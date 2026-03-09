import { describe, test, expect } from 'bun:test';
import { c, colorsDisabled, setNoColor } from '../src/colors';

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
    for (const key of colorKeys) {
      const val = (c as any)[key];
      expect(val === '' || val.startsWith('\x1b[')).toBe(true);
    }
  });

  test('setNoColor(true) disables colors dynamically', () => {
    const prevNoColor = process.env.NO_COLOR;
    const prevMemoClawNoColor = process.env.MEMOCLAW_NO_COLOR;

    try {
      delete process.env.NO_COLOR;
      delete process.env.MEMOCLAW_NO_COLOR;

      setNoColor(true);
      expect(colorsDisabled()).toBe(true);
      for (const key of colorKeys) {
        expect((c as any)[key]).toBe('');
      }
    } finally {
      if (prevNoColor === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = prevNoColor;

      if (prevMemoClawNoColor === undefined) delete process.env.MEMOCLAW_NO_COLOR;
      else process.env.MEMOCLAW_NO_COLOR = prevMemoClawNoColor;
    }
  });
});
