/**
 * Terminal color utilities
 */

export function colorsDisabled(): boolean {
  return !!process.env.NO_COLOR || !!process.env.MEMOCLAW_NO_COLOR || !process.stdout.isTTY;
}

export function setNoColor(disabled = true) {
  if (disabled) {
    process.env.NO_COLOR = '1';
    process.env.MEMOCLAW_NO_COLOR = '1';
  } else {
    delete process.env.NO_COLOR;
    delete process.env.MEMOCLAW_NO_COLOR;
  }
}

function code(ansi: string): string {
  return colorsDisabled() ? '' : ansi;
}

export const c = {
  get reset() { return code('\x1b[0m'); },
  get bold() { return code('\x1b[1m'); },
  get dim() { return code('\x1b[2m'); },
  get red() { return code('\x1b[31m'); },
  get green() { return code('\x1b[32m'); },
  get yellow() { return code('\x1b[33m'); },
  get blue() { return code('\x1b[34m'); },
  get magenta() { return code('\x1b[35m'); },
  get cyan() { return code('\x1b[36m'); },
  get gray() { return code('\x1b[90m'); },
};
