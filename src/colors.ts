/**
 * Terminal color utilities
 */

let NO_COLOR = !!process.env.NO_COLOR || !process.stdout.isTTY;

/** Disable all color output (called after arg parsing when --no-color is used) */
export function disableColors() {
  NO_COLOR = true;
  c.reset = '';
  c.bold = '';
  c.dim = '';
  c.red = '';
  c.green = '';
  c.yellow = '';
  c.blue = '';
  c.magenta = '';
  c.cyan = '';
  c.gray = '';
}

export const c: Record<string, string> = {
  reset: NO_COLOR ? '' : '\x1b[0m',
  bold: NO_COLOR ? '' : '\x1b[1m',
  dim: NO_COLOR ? '' : '\x1b[2m',
  red: NO_COLOR ? '' : '\x1b[31m',
  green: NO_COLOR ? '' : '\x1b[32m',
  yellow: NO_COLOR ? '' : '\x1b[33m',
  blue: NO_COLOR ? '' : '\x1b[34m',
  magenta: NO_COLOR ? '' : '\x1b[35m',
  cyan: NO_COLOR ? '' : '\x1b[36m',
  gray: NO_COLOR ? '' : '\x1b[90m',
};
