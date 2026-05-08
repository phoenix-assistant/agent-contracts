import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  contract,
  ContractViolationError,
  fileExists,
  fileNotExists,
  fileContains,
  fileNotContains,
  fileParseable,
  fileSizeWithin,
  check,
  allOf,
  anyOf,
  not,
  createCheck,
  consoleReporter,
  jsonReporter,
  callbackReporter,
} from '../index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-contracts-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('contract()', () => {
  it('executes step when all preconditions pass', async () => {
    await fs.writeFile(path.join(tmpDir, 'input.txt'), 'hello');

    const c = contract('test', {
      pre: [fileExists('input.txt')],
    }, { cwd: tmpDir, onViolation: 'report' });

    const result = await c.execute(async () => 42);

    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks step when precondition fails', async () => {
    const c = contract('test', {
      pre: [fileExists('missing.txt')],
    }, { cwd: tmpDir, onViolation: 'report' });

    const result = await c.execute(async () => 42);

    expect(result.success).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.phase).toBe('pre');
  });

  it('throws on violation when onViolation is throw', async () => {
    const c = contract('test', {
      pre: [fileExists('missing.txt')],
    }, { cwd: tmpDir, onViolation: 'throw' });

    await expect(c.execute(async () => 42)).rejects.toThrow(ContractViolationError);
  });

  it('warns on violation when onViolation is warn', async () => {
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    const c = contract('test', {
      pre: [fileExists('missing.txt')],
    }, { cwd: tmpDir, onViolation: 'warn' });

    const result = await c.execute(async () => 42);

    console.warn = origWarn;
    expect(result.success).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('checks postconditions after step', async () => {
    const c = contract('test', {
      post: [fileExists('output.txt')],
    }, { cwd: tmpDir, onViolation: 'report' });

    const result = await c.execute(async () => {
      await fs.writeFile(path.join(tmpDir, 'output.txt'), 'created');
      return 'done';
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('done');
  });

  it('catches postcondition failure', async () => {
    const c = contract('test', {
      post: [fileExists('output.txt')],
    }, { cwd: tmpDir, onViolation: 'report' });

    const result = await c.execute(async () => 'did nothing');

    expect(result.success).toBe(false);
    expect(result.violations[0]!.phase).toBe('post');
  });

  it('verifies invariants before AND after step', async () => {
    await fs.writeFile(path.join(tmpDir, 'config.json'), '{"key": "value"}');

    const c = contract('test', {
      invariant: [fileExists('config.json')],
    }, { cwd: tmpDir, onViolation: 'report' });

    const result = await c.execute(async () => {
      // Step that doesn't touch config
      return 'ok';
    });

    expect(result.success).toBe(true);
    expect(result.verification.invariantBefore.passed).toBe(true);
    expect(result.verification.invariantAfter.passed).toBe(true);
  });

  it('catches invariant violation when step breaks invariant', async () => {
    await fs.writeFile(path.join(tmpDir, 'config.json'), '{"key": "value"}');

    const c = contract('test', {
      invariant: [fileExists('config.json')],
    }, { cwd: tmpDir, onViolation: 'report' });

    const result = await c.execute(async () => {
      await fs.rm(path.join(tmpDir, 'config.json'));
      return 'deleted config';
    });

    expect(result.success).toBe(false);
    expect(result.verification.invariantAfter.passed).toBe(false);
  });

  it('captures step errors separately from violations', async () => {
    await fs.writeFile(path.join(tmpDir, 'input.txt'), 'hello');

    const c = contract('test', {
      pre: [fileExists('input.txt')],
    }, { cwd: tmpDir, onViolation: 'report' });

    const result = await c.execute(async () => {
      throw new Error('step exploded');
    });

    expect(result.success).toBe(false);
    expect(result.stepError?.message).toBe('step exploded');
    expect(result.verification.pre.passed).toBe(true);
  });

  it('continues checking after failure when continueOnFailure is true', async () => {
    const c = contract('test', {
      pre: [
        fileExists('missing1.txt'),
        fileExists('missing2.txt'),
      ],
    }, { cwd: tmpDir, onViolation: 'report', continueOnFailure: true });

    const result = await c.execute(async () => 42);

    expect(result.violations).toHaveLength(2);
  });

  it('stops at first failure when continueOnFailure is false', async () => {
    const c = contract('test', {
      pre: [
        fileExists('missing1.txt'),
        fileExists('missing2.txt'),
      ],
    }, { cwd: tmpDir, onViolation: 'report', continueOnFailure: false });

    const result = await c.execute(async () => 42);

    expect(result.violations).toHaveLength(1);
  });

  it('measures execution duration', async () => {
    const c = contract('test', {}, { cwd: tmpDir, onViolation: 'report' });

    const result = await c.execute(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'slow';
    });

    expect(result.durationMs).toBeGreaterThan(40);
  });
});

describe('File Checks', () => {
  it('fileExists passes for existing file', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'content');
    const c = contract('test', { pre: [fileExists('test.txt')] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('fileNotExists passes for missing file', async () => {
    const c = contract('test', { pre: [fileNotExists('missing.txt')] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('fileContains detects string presence', async () => {
    await fs.writeFile(path.join(tmpDir, 'code.ts'), 'export function hello() {}');
    const c = contract('test', { pre: [fileContains('code.ts', 'function hello')] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('fileContains works with regex', async () => {
    await fs.writeFile(path.join(tmpDir, 'code.ts'), 'export function hello() {}');
    const c = contract('test', { pre: [fileContains('code.ts', /function \w+\(/)] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('fileNotContains detects string absence', async () => {
    await fs.writeFile(path.join(tmpDir, 'code.ts'), 'export function hello() {}');
    const c = contract('test', { pre: [fileNotContains('code.ts', 'console.log')] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('fileParseable validates JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'config.json'), '{"valid": true}');
    const c = contract('test', { pre: [fileParseable('config.json', 'json')] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('fileParseable rejects invalid JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'config.json'), '{invalid}');
    const c = contract('test', { pre: [fileParseable('config.json', 'json')] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(false);
  });

  it('fileSizeWithin checks byte range', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello world');
    const c = contract('test', { pre: [fileSizeWithin('test.txt', 1, 100)] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });
});

describe('Custom Checks', () => {
  it('check() creates a simple boolean check', async () => {
    const isEven = check('is-even', () => 4 % 2 === 0);
    const c = contract('test', { pre: [isEven] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('createCheck() with async logic', async () => {
    const myCheck = createCheck('custom', async () => {
      return { passed: true, message: 'custom passed', durationMs: 0 };
    });
    const c = contract('test', { pre: [myCheck] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('allOf() requires all checks to pass', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
    const combined = allOf('all-files', [
      fileExists('a.txt'),
      fileNotExists('b.txt'),
    ]);
    const c = contract('test', { pre: [combined] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('anyOf() passes when at least one check passes', async () => {
    const combined = anyOf('any-file', [
      fileExists('a.txt'),
      fileExists('b.txt'),
      check('always-true', () => true),
    ]);
    const c = contract('test', { pre: [combined] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('not() inverts a check', async () => {
    const notExists = not(fileExists('missing.txt'));
    const c = contract('test', { pre: [notExists] }, { cwd: tmpDir, onViolation: 'report' });
    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });
});

describe('Reporters', () => {
  it('jsonReporter collects results', async () => {
    const reporter = jsonReporter();
    const c = contract('test', {
      pre: [check('always-pass', () => true)],
    }, { cwd: tmpDir, onViolation: 'report', reporters: [reporter] });

    await c.execute(async () => 'ok');
    const reports = reporter.getReport();
    expect(reports).toHaveLength(1);
    expect(reports[0]!.success).toBe(true);
  });

  it('callbackReporter fires on violation', async () => {
    const violations: any[] = [];
    const reporter = callbackReporter({
      onViolation: (v) => violations.push(v),
    });
    const c = contract('test', {
      pre: [fileExists('nope.txt')],
    }, { cwd: tmpDir, onViolation: 'report', reporters: [reporter] });

    await c.execute(async () => 'ok');
    expect(violations).toHaveLength(1);
    expect(violations[0].checkName).toBe('file-exists');
  });
});

describe('verifyPre / verifyPost / verifyInvariants', () => {
  it('verifyPre checks only preconditions', async () => {
    await fs.writeFile(path.join(tmpDir, 'input.txt'), 'data');
    const c = contract('test', {
      pre: [fileExists('input.txt')],
      post: [fileExists('output.txt')],
    }, { cwd: tmpDir });

    const result = await c.verifyPre();
    expect(result.passed).toBe(true);
  });

  it('verifyInvariants checks invariants standalone', async () => {
    await fs.writeFile(path.join(tmpDir, 'config.json'), '{}');
    const c = contract('test', {
      invariant: [fileParseable('config.json', 'json')],
    }, { cwd: tmpDir });

    const result = await c.verifyInvariants();
    expect(result.passed).toBe(true);
  });
});

describe('Full contract scenario', () => {
  it('edit-file contract end-to-end', async () => {
    // Setup: create source file
    await fs.writeFile(path.join(tmpDir, 'utils.ts'), `
export function calculateTotal(items: number[]): number {
  return items.reduce((sum, n) => sum + n, 0);
}

export function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2);
}
`);

    const editContract = contract('edit-function', {
      pre: [
        fileExists('utils.ts'),
        fileContains('utils.ts', 'calculateTotal'),
      ],
      post: [
        fileExists('utils.ts'),
        fileContains('utils.ts', 'calculateTotal'),
        // Verify formatCurrency wasn't removed
        fileContains('utils.ts', 'formatCurrency'),
      ],
      invariant: [
        fileParseable('utils.ts', 'typescript'),
      ],
    }, { cwd: tmpDir, onViolation: 'report' });

    const result = await editContract.execute(async () => {
      // Simulate agent editing the function
      const content = await fs.readFile(path.join(tmpDir, 'utils.ts'), 'utf-8');
      const modified = content.replace(
        'return items.reduce((sum, n) => sum + n, 0);',
        'return items.reduce((sum, n) => sum + n, 0) || 0;',
      );
      await fs.writeFile(path.join(tmpDir, 'utils.ts'), modified);
      return 'edited';
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('edited');
    expect(result.violations).toHaveLength(0);
  });
});
