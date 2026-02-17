import { describe, test, expect } from 'bun:test';
import { setRequestTimeout, getRequestTimeout } from '../src/http';

describe('request timeout', () => {
  test('default timeout is 30000ms', () => {
    // Reset to default
    setRequestTimeout(30000);
    expect(getRequestTimeout()).toBe(30000);
  });

  test('setRequestTimeout changes the value', () => {
    setRequestTimeout(60000);
    expect(getRequestTimeout()).toBe(60000);
    // Restore
    setRequestTimeout(30000);
  });

  test('accepts 0 timeout', () => {
    setRequestTimeout(0);
    expect(getRequestTimeout()).toBe(0);
    setRequestTimeout(30000);
  });
});
