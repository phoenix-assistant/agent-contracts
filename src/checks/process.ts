import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { Check } from '../core/types.js';
import { registry } from '../core/registry.js';

const execAsync = promisify(execCb);

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCommand(cmd: string, cwd: string): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: (e.stdout ?? '').toString().trim(),
      stderr: (e.stderr ?? '').toString().trim(),
      exitCode: e.code ?? 1,
    };
  }
}

/**
 * Check that a command exits with code 0.
 */
export function commandSucceeds(cmd: string): Check {
  return {
    name: 'command-succeeds',
    description: `Command succeeds: ${cmd}`,
    verify: async (ctx) => {
      const start = performance.now();
      const result = await runCommand(cmd, ctx.cwd);
      return {
        passed: result.exitCode === 0,
        message: result.exitCode === 0
          ? `Command succeeded: ${cmd}`
          : `Command failed (exit ${result.exitCode}): ${cmd}`,
        details: {
          cmd,
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 500),
          stderr: result.stderr.slice(0, 500),
        },
        durationMs: performance.now() - start,
      };
    },
  };
}

/**
 * Check that a command's stdout contains a string or matches a regex.
 */
export function commandOutputContains(cmd: string, pattern: string | RegExp): Check {
  const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
  return {
    name: 'command-output-contains',
    description: `Output of "${cmd}" contains: ${patternStr}`,
    verify: async (ctx) => {
      const start = performance.now();
      const result = await runCommand(cmd, ctx.cwd);
      const output = result.stdout + '\n' + result.stderr;
      const matches = pattern instanceof RegExp
        ? pattern.test(output)
        : output.includes(pattern);
      return {
        passed: matches,
        message: matches
          ? `Output contains expected pattern`
          : `Output does not contain: ${patternStr}`,
        details: {
          cmd,
          pattern: patternStr,
          stdout: result.stdout.slice(0, 500),
          stderr: result.stderr.slice(0, 500),
        },
        durationMs: performance.now() - start,
      };
    },
  };
}

/**
 * Check that a test suite passes (alias for commandSucceeds with semantic naming).
 */
export function testsPass(cmd: string): Check {
  return {
    ...commandSucceeds(cmd),
    name: 'tests-pass',
    description: `Tests pass: ${cmd}`,
  };
}

/**
 * Check that the project compiles (alias for commandSucceeds with semantic naming).
 */
export function projectCompiles(cmd: string): Check {
  return {
    ...commandSucceeds(cmd),
    name: 'project-compiles',
    description: `Project compiles: ${cmd}`,
  };
}

/**
 * Check that a command produces no new lint errors.
 */
export function noNewLintErrors(cmd: string): Check {
  return {
    ...commandSucceeds(cmd),
    name: 'no-new-lint-errors',
    description: `No lint errors: ${cmd}`,
  };
}

// Register all process checks
registry.register('command-succeeds', (cmd: unknown) => commandSucceeds(cmd as string));
registry.register('command-output-contains', (cmd: unknown, pattern: unknown) =>
  commandOutputContains(cmd as string, pattern as string));
registry.register('tests-pass', (cmd: unknown) => testsPass(cmd as string));
registry.register('project-compiles', (cmd: unknown) => projectCompiles(cmd as string));
registry.register('no-new-lint-errors', (cmd: unknown) => noNewLintErrors(cmd as string));
