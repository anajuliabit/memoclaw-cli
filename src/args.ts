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
  'force', 'count', 'wide', 'pretty', 'watch', 'interactive', 'yes', 'reverse',
  'noTruncate', 'batch', 'idOnly', 'noRetry', 'all', 'check', 'noPreview',
]);

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

function normalizeBoolean(value: any): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value == null) return null;
  const str = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(str)) return true;
  if (FALSE_VALUES.has(str)) return false;
  return null;
}

/** Short flag aliases */
const SHORT_FLAGS: Record<string, string> = {
  '-h': 'help',
  '-v': 'version',
  '-j': 'json',
  '-q': 'quiet',
  '-n': 'namespace',
  '-l': 'limit',
  '-t': 'tags',
  '-o': 'offset',
  '-f': 'format',
  '-p': 'pretty',
  '-i': 'interactive',
  '-w': 'watch',
  '-d': 'dryRun',
  '-c': 'concurrency',
  '-s': 'truncate',
  '-y': 'yes',
  '-T': 'timeout',
  '-x': 'text',
  '-e': 'expiresAt',
  '-C': 'category',
  '-S': 'sessionId',
  '-A': 'agentId',
  '-r': 'reverse',
  '-m': 'sortBy',
  '-k': 'columns',
  '-O': 'output',
  '-F': 'field',
  '-M': 'memoryType',
};

export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { _: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Short flags (single like -j or combined like -jq)
    if (arg[0] === '-' && arg[1] !== '-' && arg.length >= 2) {
      // Check for -X=value syntax first
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const flagPart = arg.slice(0, eqIdx);
        const valuePart = arg.slice(eqIdx + 1);
        if (SHORT_FLAGS[flagPart]) {
          const key = SHORT_FLAGS[flagPart];
          if (BOOLEAN_FLAGS.has(key)) {
            const boolVal = normalizeBoolean(valuePart);
            result[key] = boolVal ?? true;
          } else {
            result[key] = valuePart;
          }
          i++;
          continue;
        }
      }
      
      // Check if it's a known single short flag first
      if (arg.length === 2 && SHORT_FLAGS[arg]) {
        const key = SHORT_FLAGS[arg];
        if (BOOLEAN_FLAGS.has(key)) {
          const next = args[i + 1];
          const boolVal = next !== undefined && !next.startsWith('--') ? normalizeBoolean(next) : null;
          if (boolVal !== null) {
            result[key] = boolVal;
            i += 2;
          } else {
            result[key] = true;
            i++;
          }
        } else {
          const next = args[i + 1];
          // Match long-flag behavior: only reject values starting with '--'
          // (single '-' is common in tags, namespaces, etc.)
          if (next !== undefined && (!next.startsWith('--') || /^--?\d/.test(next))) {
            result[key] = next;
            i += 2;
          } else {
            result[key] = true;
            i++;
          }
        }
      } else if (arg.length > 2 && !SHORT_FLAGS[arg]) {
        // Combined short flags like -jq
        const chars = arg.slice(1).split('');
        let allValid = true;
        for (const ch of chars) {
          const flag = `-${ch}`;
          if (!SHORT_FLAGS[flag]) { allValid = false; break; }
        }
        if (allValid) {
          // Only allow combined if all resolve to boolean flags (last may take value)
          for (let ci = 0; ci < chars.length; ci++) {
            const flag = `-${chars[ci]}`;
            const key = SHORT_FLAGS[flag];
            if (BOOLEAN_FLAGS.has(key)) {
              const next = args[i + 1];
              const boolVal = next !== undefined && !next.startsWith('--') ? normalizeBoolean(next) : null;
              if (boolVal !== null && ci === chars.length - 1) {
                result[key] = boolVal;
                i++; // extra bump when value consumed
              } else {
                result[key] = true;
              }
            } else if (ci === chars.length - 1) {
              // Last flag can take a value
              const next = args[i + 1];
              if (next !== undefined && (!next.startsWith('--') || /^--?\d/.test(next))) {
                result[key] = next;
                i++; // extra bump for consumed value
              } else {
                result[key] = true;
              }
            } else {
              // Non-boolean in middle of combined flags — treat as boolean
              result[key] = true;
            }
          }
          i++;
        } else {
          // Unknown combined flag, treat as positional
          result._.push(arg);
          i++;
        }
      } else {
        result._.push(arg);
        i++;
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
        if (BOOLEAN_FLAGS.has(key)) {
          const boolVal = normalizeBoolean(inlineValue);
          result[key] = boolVal ?? true;
        } else {
          result[key] = inlineValue;
        }
        i++;
      } else if (BOOLEAN_FLAGS.has(key)) {
        const next = args[i + 1];
        const boolVal = next !== undefined && (!next.startsWith('--') || /^--?\d/.test(next)) ? normalizeBoolean(next) : null;
        if (boolVal !== null) {
          result[key] = boolVal;
          i += 2;
        } else {
          result[key] = true;
          i++;
        }
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
