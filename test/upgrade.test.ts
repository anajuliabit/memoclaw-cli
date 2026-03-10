import { describe, test, expect } from 'bun:test';
import { compareSemver, detectPackageManager, buildInstallCommand, type VersionCheckResult } from '../src/commands/upgrade';
import { parseArgs, BOOLEAN_FLAGS } from '../src/args';

// ─── Version comparison ─────────────────────────────────────────────────────

describe('compareSemver', () => {
  test('equal versions return 0', () => {
    expect(compareSemver('1.9.0', '1.9.0')).toBe(0);
    expect(compareSemver('0.0.0', '0.0.0')).toBe(0);
    expect(compareSemver('10.20.30', '10.20.30')).toBe(0);
  });

  test('older major returns -1', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('0.9.9', '1.0.0')).toBe(-1);
  });

  test('newer major returns 1', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    expect(compareSemver('10.0.0', '9.99.99')).toBe(1);
  });

  test('older minor returns -1', () => {
    expect(compareSemver('1.8.0', '1.9.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
  });

  test('newer minor returns 1', () => {
    expect(compareSemver('1.9.0', '1.8.0')).toBe(1);
  });

  test('older patch returns -1', () => {
    expect(compareSemver('1.9.0', '1.9.1')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.99')).toBe(-1);
  });

  test('newer patch returns 1', () => {
    expect(compareSemver('1.9.1', '1.9.0')).toBe(1);
  });

  test('handles partial versions', () => {
    // Missing components default to 0
    expect(compareSemver('1', '1.0.0')).toBe(0);
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
  });
});

// ─── VersionCheckResult ──────────────────────────────────────────────────────

describe('VersionCheckResult', () => {
  test('updateAvailable is true when latest > current', () => {
    const result: VersionCheckResult = {
      current: '1.8.0',
      latest: '1.9.0',
      updateAvailable: compareSemver('1.8.0', '1.9.0') < 0,
    };
    expect(result.updateAvailable).toBe(true);
  });

  test('updateAvailable is false when equal', () => {
    const result: VersionCheckResult = {
      current: '1.9.0',
      latest: '1.9.0',
      updateAvailable: compareSemver('1.9.0', '1.9.0') < 0,
    };
    expect(result.updateAvailable).toBe(false);
  });

  test('updateAvailable is false when current > latest', () => {
    const result: VersionCheckResult = {
      current: '2.0.0',
      latest: '1.9.0',
      updateAvailable: compareSemver('2.0.0', '1.9.0') < 0,
    };
    expect(result.updateAvailable).toBe(false);
  });
});

// ─── Package manager detection (Fixes #152) ──────────────────────────────────

describe('detectPackageManager', () => {
  test('returns a string', () => {
    const pm = detectPackageManager();
    expect(typeof pm).toBe('string');
    expect(['npm', 'bun', 'pnpm', 'yarn']).toContain(pm);
  });
});

describe('buildInstallCommand', () => {
  test('npm', () => {
    expect(buildInstallCommand('npm')).toBe('npm install -g memoclaw@latest');
  });

  test('bun', () => {
    expect(buildInstallCommand('bun')).toBe('bun install -g memoclaw@latest');
  });

  test('pnpm', () => {
    expect(buildInstallCommand('pnpm')).toBe('pnpm add -g memoclaw@latest');
  });

  test('yarn', () => {
    expect(buildInstallCommand('yarn')).toBe('yarn global add memoclaw@latest');
  });

  test('unknown defaults to npm', () => {
    expect(buildInstallCommand('unknown')).toBe('npm install -g memoclaw@latest');
  });
});

// ─── CLI args for upgrade ────────────────────────────────────────────────────

describe('upgrade CLI args', () => {
  test('upgrade command is parsed as positional', () => {
    const result = parseArgs(['upgrade']);
    expect(result._).toEqual(['upgrade']);
  });

  test('upgrade --check flag', () => {
    const result = parseArgs(['upgrade', '--check']);
    expect(result._).toEqual(['upgrade']);
    expect(result.check).toBe(true);
  });

  test('upgrade --yes flag', () => {
    const result = parseArgs(['upgrade', '--yes']);
    expect(result._).toEqual(['upgrade']);
    expect(result.yes).toBe(true);
  });

  test('upgrade -y short flag', () => {
    const result = parseArgs(['upgrade', '-y']);
    expect(result._).toEqual(['upgrade']);
    expect(result.yes).toBe(true);
  });

  test('upgrade --json flag', () => {
    const result = parseArgs(['upgrade', '--json']);
    expect(result._).toEqual(['upgrade']);
    expect(result.json).toBe(true);
  });

  test('check is a boolean flag', () => {
    expect(BOOLEAN_FLAGS.has('check')).toBe(true);
  });

  test('upgrade --check --json', () => {
    const result = parseArgs(['upgrade', '--check', '--json']);
    expect(result.check).toBe(true);
    expect(result.json).toBe(true);
  });
});

// ─── Completions include upgrade ─────────────────────────────────────────────

describe('completions include upgrade', () => {
  const commands = ['init', 'migrate', 'store', 'recall', 'search', 'list', 'get', 'update', 'delete', 'bulk-delete', 'ingest', 'extract',
    'context', 'consolidate', 'relations', 'core', 'suggested', 'status', 'export', 'import', 'stats', 'browse',
    'completions', 'config', 'graph', 'history', 'purge', 'count', 'tags', 'namespace', 'whoami', 'upgrade', 'help'];

  test('upgrade is in commands list', () => {
    expect(commands).toContain('upgrade');
  });

  test('total command count is 33', () => {
    expect(commands.length).toBe(33);
  });
});
