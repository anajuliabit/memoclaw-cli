/**
 * Shared argument parser for MemoClaw CLI
 */

export interface ParsedArgs {
  _: string[];
  [key: string]: any;
}

/** Boolean-only flags that never take a value */
export const BOOLEAN_FLAGS = new Set([
  'help', 'version', 'raw', 'json', 'quiet', 'dryRun', 'verbose', 'noColor',
]);

/** Short flag aliases */
const SHORT_FLAGS: Record<string, string> = {
  '-h': 'help',
  '-v': 'version',
  '-j': 'json',
  '-q': 'quiet',
  '-n': 'namespace',
  '-l': 'limit',
  '-t': 'tags',
  '-o': 'output',
};

export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { _: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Short flags
    if (arg.length === 2 && arg[0] === '-' && arg[1] !== '-' && SHORT_FLAGS[arg]) {
      const key = SHORT_FLAGS[arg];
      if (BOOLEAN_FLAGS.has(key)) {
        result[key] = true;
        i++;
      } else {
        const next = args[i + 1];
        if (next !== undefined) {
          result[key] = next;
          i += 2;
        } else {
          result[key] = true;
          i++;
        }
      }
    } else if (arg === '--') {
      // Everything after -- is positional
      result._.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      let key: string;
      let inlineValue: string | undefined;

      if (eqIdx !== -1) {
        key = arg.slice(2, eqIdx).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        inlineValue = arg.slice(eqIdx + 1);
      } else {
        key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      }

      if (inlineValue !== undefined) {
        result[key] = inlineValue;
        i++;
      } else if (BOOLEAN_FLAGS.has(key)) {
        result[key] = true;
        i++;
      } else {
        const next = args[i + 1];
        // Allow negative numbers as values (e.g., --offset -1 is unlikely but --importance -0.5... well)
        // Treat next as value if it exists and doesn't look like a flag (starts with -- but not a negative number)
        if (next !== undefined && (!next.startsWith('--') || /^--?\d/.test(next))) {
          result[key] = next;
          i += 2;
        } else {
          result[key] = true;
          i++;
        }
      }
    } else {
      result._.push(arg);
      i++;
    }
  }
  return result;
}
