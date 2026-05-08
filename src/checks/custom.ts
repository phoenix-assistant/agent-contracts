import type { Check, CheckContext, CheckResult } from '../core/types.js';
import { registry } from '../core/registry.js';

interface CustomCheckParams {
  [key: string]: { type: string; description?: string };
}

/**
 * Create a custom check with user-defined verification logic.
 *
 * @example
 * ```ts
 * const dbRowCount = createCheck('db-row-count', async (ctx) => {
 *   const count = await db.query('SELECT COUNT(*) FROM users');
 *   return count >= (ctx.params.min as number);
 * }, {
 *   description: 'Verify minimum row count in database',
 *   params: { min: { type: 'number' } },
 * });
 * ```
 */
export function createCheck(
  name: string,
  fn: (ctx: CheckContext) => Promise<boolean | CheckResult>,
  options?: {
    description?: string;
    params?: CustomCheckParams;
  },
): Check {
  return {
    name,
    description: options?.description ?? `Custom check: ${name}`,
    verify: async (ctx) => {
      const start = performance.now();
      try {
        const result = await fn(ctx);
        if (typeof result === 'boolean') {
          return {
            passed: result,
            message: result ? `${name}: passed` : `${name}: failed`,
            durationMs: performance.now() - start,
          };
        }
        return { ...result, durationMs: performance.now() - start };
      } catch (err) {
        return {
          passed: false,
          message: `${name} threw: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

/**
 * Create a check from a simple boolean function.
 */
export function check(name: string, fn: () => Promise<boolean> | boolean, description?: string): Check {
  return {
    name,
    description: description ?? name,
    verify: async () => {
      const start = performance.now();
      try {
        const passed = await fn();
        return {
          passed,
          message: passed ? `${name}: passed` : `${name}: failed`,
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          passed: false,
          message: `${name} threw: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

/**
 * Compose multiple checks into one that passes only if ALL pass.
 */
export function allOf(name: string, checks: Check[]): Check {
  return {
    name,
    description: `All of: ${checks.map((c) => c.name).join(', ')}`,
    verify: async (ctx) => {
      const start = performance.now();
      const failures: string[] = [];
      for (const c of checks) {
        const result = await c.verify(ctx);
        if (!result.passed) {
          failures.push(`${c.name}: ${result.message}`);
        }
      }
      return {
        passed: failures.length === 0,
        message: failures.length === 0
          ? `All ${checks.length} checks passed`
          : `${failures.length}/${checks.length} failed: ${failures.join('; ')}`,
        durationMs: performance.now() - start,
      };
    },
  };
}

/**
 * Compose multiple checks into one that passes if ANY passes.
 */
export function anyOf(name: string, checks: Check[]): Check {
  return {
    name,
    description: `Any of: ${checks.map((c) => c.name).join(', ')}`,
    verify: async (ctx) => {
      const start = performance.now();
      for (const c of checks) {
        const result = await c.verify(ctx);
        if (result.passed) {
          return {
            passed: true,
            message: `Passed via ${c.name}`,
            durationMs: performance.now() - start,
          };
        }
      }
      return {
        passed: false,
        message: `None of ${checks.length} checks passed`,
        durationMs: performance.now() - start,
      };
    },
  };
}

/**
 * Negate a check — passes when the inner check fails.
 */
export function not(innerCheck: Check): Check {
  return {
    name: `not-${innerCheck.name}`,
    description: `NOT: ${innerCheck.description}`,
    verify: async (ctx) => {
      const result = await innerCheck.verify(ctx);
      return {
        passed: !result.passed,
        message: result.passed
          ? `Expected failure but got: ${result.message}`
          : `Correctly negated: ${result.message}`,
        durationMs: result.durationMs,
      };
    },
  };
}
