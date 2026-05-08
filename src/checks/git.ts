import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { Check } from '../core/types.js';
import { registry } from '../core/registry.js';

const execAsync = promisify(execCb);

async function git(args: string, cwd: string): Promise<{ stdout: string; exitCode: number }> {
  try {
    const { stdout } = await execAsync(`git ${args}`, { cwd, timeout: 15_000 });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; code?: number };
    return { stdout: (e.stdout ?? '').toString().trim(), exitCode: e.code ?? 1 };
  }
}

/**
 * Check that the git working tree has no unstaged changes.
 */
export function noUnstagedChanges(): Check {
  return {
    name: 'no-unstaged-changes',
    description: 'Git working tree is clean',
    verify: async (ctx) => {
      const start = performance.now();
      const result = await git('diff --name-only', ctx.cwd);
      const hasChanges = result.stdout.length > 0;
      return {
        passed: !hasChanges,
        message: hasChanges
          ? `Unstaged changes in: ${result.stdout.split('\n').join(', ')}`
          : 'Working tree clean',
        details: hasChanges ? { files: result.stdout.split('\n') } : undefined,
        durationMs: performance.now() - start,
      };
    },
  };
}

/**
 * Check that only specific files were changed (glob patterns).
 */
export function onlyFilesChanged(patterns: string[]): Check {
  return {
    name: 'only-files-changed',
    description: `Only files matching [${patterns.join(', ')}] changed`,
    verify: async (ctx) => {
      const start = performance.now();
      const result = await git('diff --name-only HEAD', ctx.cwd);
      if (result.stdout.length === 0) {
        return {
          passed: true,
          message: 'No files changed',
          durationMs: performance.now() - start,
        };
      }

      const changedFiles = result.stdout.split('\n');
      const unexpected = changedFiles.filter(
        (f) => !patterns.some((p) => matchGlob(f, p)),
      );

      return {
        passed: unexpected.length === 0,
        message: unexpected.length === 0
          ? `All changed files match allowed patterns`
          : `Unexpected files changed: ${unexpected.join(', ')}`,
        details: { changedFiles, unexpected, allowedPatterns: patterns },
        durationMs: performance.now() - start,
      };
    },
  };
}

/**
 * Check that specific files were NOT modified.
 */
export function noOtherFilesChanged(protectedPatterns: string[]): Check {
  return {
    name: 'no-other-files-changed',
    description: `Protected files [${protectedPatterns.join(', ')}] not changed`,
    verify: async (ctx) => {
      const start = performance.now();
      const result = await git('diff --name-only HEAD', ctx.cwd);
      if (result.stdout.length === 0) {
        return {
          passed: true,
          message: 'No files changed',
          durationMs: performance.now() - start,
        };
      }

      const changedFiles = result.stdout.split('\n');
      const violated = changedFiles.filter(
        (f) => protectedPatterns.some((p) => matchGlob(f, p)),
      );

      return {
        passed: violated.length === 0,
        message: violated.length === 0
          ? `No protected files were changed`
          : `Protected files were modified: ${violated.join(', ')}`,
        details: { changedFiles, violated, protectedPatterns },
        durationMs: performance.now() - start,
      };
    },
  };
}

/**
 * Check that the commit message matches a pattern.
 */
export function commitMessageMatches(pattern: string | RegExp): Check {
  const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
  return {
    name: 'commit-message-matches',
    description: `Last commit message matches: ${patternStr}`,
    verify: async (ctx) => {
      const start = performance.now();
      const result = await git('log -1 --format=%s', ctx.cwd);
      const matches = pattern instanceof RegExp
        ? pattern.test(result.stdout)
        : result.stdout.includes(pattern);
      return {
        passed: matches,
        message: matches
          ? `Commit message matches pattern`
          : `Commit message "${result.stdout}" doesn't match: ${patternStr}`,
        details: { message: result.stdout, pattern: patternStr },
        durationMs: performance.now() - start,
      };
    },
  };
}

/**
 * Simple glob matching (supports * and **).
 */
function matchGlob(filepath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{DOUBLE_STAR}}/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`).test(filepath);
}

// Register all git checks
registry.register('no-unstaged-changes', () => noUnstagedChanges());
registry.register('only-files-changed', (patterns: unknown) => onlyFilesChanged(patterns as string[]));
registry.register('no-other-files-changed', (patterns: unknown) => noOtherFilesChanged(patterns as string[]));
registry.register('commit-message-matches', (pattern: unknown) => commitMessageMatches(pattern as string));
