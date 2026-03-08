import { describe, test, expect } from 'bun:test';
import { setMaxRetries, getMaxRetries } from '../src/http';

describe('retry configuration', () => {
  test('default max retries is 3', () => {
    setMaxRetries(3); // reset
    expect(getMaxRetries()).toBe(3);
  });

  test('setMaxRetries changes the value', () => {
    setMaxRetries(5);
    expect(getMaxRetries()).toBe(5);
    setMaxRetries(3); // restore
  });

  test('setMaxRetries(0) disables retries', () => {
    setMaxRetries(0);
    expect(getMaxRetries()).toBe(0);
    setMaxRetries(3); // restore
  });

  test('negative values become 0', () => {
    setMaxRetries(-5);
    expect(getMaxRetries()).toBe(0);
    setMaxRetries(3); // restore
  });

  test('float values are floored', () => {
    setMaxRetries(2.7);
    expect(getMaxRetries()).toBe(2);
    setMaxRetries(3); // restore
  });
});
