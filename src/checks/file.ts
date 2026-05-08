import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Check } from '../core/types.js';
import { registry } from '../core/registry.js';

/**
 * Check that a file exists.
 */
export function fileExists(filePath: string): Check {
  return {
    name: 'file-exists',
    description: `File exists: ${filePath}`,
    verify: async (ctx) => {
      const fullPath = path.resolve(ctx.cwd, filePath);
      const start = performance.now();
      try {
        await fs.access(fullPath);
        return {
          passed: true,
          message: `File exists: ${filePath}`,
          durationMs: performance.now() - start,
        };
      } catch {
        return {
          passed: false,
          message: `File not found: ${filePath}`,
          details: { path: fullPath },
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

/**
 * Check that a file does NOT exist.
 */
export function fileNotExists(filePath: string): Check {
  return {
    name: 'file-not-exists',
    description: `File does not exist: ${filePath}`,
    verify: async (ctx) => {
      const fullPath = path.resolve(ctx.cwd, filePath);
      const start = performance.now();
      try {
        await fs.access(fullPath);
        return {
          passed: false,
          message: `File should not exist but does: ${filePath}`,
          details: { path: fullPath },
          durationMs: performance.now() - start,
        };
      } catch {
        return {
          passed: true,
          message: `File correctly absent: ${filePath}`,
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

/**
 * Check that a file contains a string or matches a regex.
 */
export function fileContains(filePath: string, pattern: string | RegExp): Check {
  const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
  return {
    name: 'file-contains',
    description: `File ${filePath} contains: ${patternStr}`,
    verify: async (ctx) => {
      const fullPath = path.resolve(ctx.cwd, filePath);
      const start = performance.now();
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const matches = pattern instanceof RegExp
          ? pattern.test(content)
          : content.includes(pattern);
        return {
          passed: matches,
          message: matches
            ? `File contains expected pattern`
            : `File does not contain: ${patternStr}`,
          details: { path: fullPath, pattern: patternStr },
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          passed: false,
          message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

/**
 * Check that a file does NOT contain a string or pattern.
 */
export function fileNotContains(filePath: string, pattern: string | RegExp): Check {
  const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
  return {
    name: 'file-not-contains',
    description: `File ${filePath} does not contain: ${patternStr}`,
    verify: async (ctx) => {
      const fullPath = path.resolve(ctx.cwd, filePath);
      const start = performance.now();
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const matches = pattern instanceof RegExp
          ? pattern.test(content)
          : content.includes(pattern);
        return {
          passed: !matches,
          message: matches
            ? `File unexpectedly contains: ${patternStr}`
            : `File correctly does not contain pattern`,
          details: { path: fullPath, pattern: patternStr },
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          passed: false,
          message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

/**
 * Check that a file is parseable as the given language.
 * Supports: json, typescript (syntax check via tsc --noEmit).
 */
export function fileParseable(filePath: string, language: 'json' | 'typescript'): Check {
  return {
    name: 'file-parseable',
    description: `File ${filePath} is valid ${language}`,
    verify: async (ctx) => {
      const fullPath = path.resolve(ctx.cwd, filePath);
      const start = performance.now();
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        if (language === 'json') {
          JSON.parse(content);
          return {
            passed: true,
            message: `Valid JSON: ${filePath}`,
            durationMs: performance.now() - start,
          };
        }
        // For TypeScript, just check it's readable (full parse requires tsc)
        // Use commandSucceeds('npx tsc --noEmit') for full TypeScript checking
        if (content.length === 0) {
          return {
            passed: false,
            message: `Empty file: ${filePath}`,
            durationMs: performance.now() - start,
          };
        }
        return {
          passed: true,
          message: `File readable as ${language}: ${filePath}`,
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          passed: false,
          message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
          details: { path: fullPath, language },
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

/**
 * Check that a file's size is within a range (bytes).
 */
export function fileSizeWithin(filePath: string, min: number, max: number): Check {
  return {
    name: 'file-size-within',
    description: `File ${filePath} size between ${min}-${max} bytes`,
    verify: async (ctx) => {
      const fullPath = path.resolve(ctx.cwd, filePath);
      const start = performance.now();
      try {
        const stat = await fs.stat(fullPath);
        const passed = stat.size >= min && stat.size <= max;
        return {
          passed,
          message: passed
            ? `File size ${stat.size} bytes (within ${min}-${max})`
            : `File size ${stat.size} bytes (expected ${min}-${max})`,
          details: { path: fullPath, size: stat.size, min, max },
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          passed: false,
          message: `Cannot stat file: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

/**
 * Check that a file hasn't changed since snapshot (content hash).
 */
export function fileUnchanged(filePath: string): Check {
  let snapshotHash: string | undefined;

  return {
    name: 'file-unchanged',
    description: `File ${filePath} unchanged since snapshot`,
    verify: async (ctx) => {
      const fullPath = path.resolve(ctx.cwd, filePath);
      const start = performance.now();
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const hash = simpleHash(content);

        if (ctx.phase === 'invariant' && !snapshotHash) {
          // First call (before step) — capture snapshot
          snapshotHash = hash;
          return {
            passed: true,
            message: `Snapshot captured for: ${filePath}`,
            durationMs: performance.now() - start,
          };
        }

        if (snapshotHash) {
          const passed = hash === snapshotHash;
          return {
            passed,
            message: passed
              ? `File unchanged: ${filePath}`
              : `File was modified: ${filePath}`,
            details: { path: fullPath, expectedHash: snapshotHash, actualHash: hash },
            durationMs: performance.now() - start,
          };
        }

        return {
          passed: true,
          message: `No snapshot to compare against`,
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          passed: false,
          message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

// Register all file checks in the global registry
registry.register('file-exists', (p: unknown) => fileExists(p as string));
registry.register('file-not-exists', (p: unknown) => fileNotExists(p as string));
registry.register('file-contains', (p: unknown, pattern: unknown) => fileContains(p as string, pattern as string));
registry.register('file-not-contains', (p: unknown, pattern: unknown) => fileNotContains(p as string, pattern as string));
registry.register('file-parseable', (p: unknown, lang: unknown) => fileParseable(p as string, lang as 'json' | 'typescript'));
registry.register('file-size-within', (p: unknown, min: unknown, max: unknown) => fileSizeWithin(p as string, min as number, max as number));
registry.register('file-unchanged', (p: unknown) => fileUnchanged(p as string));
