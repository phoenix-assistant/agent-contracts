import type {
  Check,
  CheckContext,
  CheckPhase,
  CheckResult,
  CheckResultWithMeta,
  Contract,
  ContractOptions,
  ContractResult,
  ContractSpec,
  Reporter,
  StateSnapshot,
  VerificationResult,
  Violation,
  ViolationAction,
} from './types.js';

const DEFAULT_OPTIONS: Required<ContractOptions> = {
  cwd: process.cwd(),
  onViolation: 'throw',
  reporters: [],
  checkTimeout: 30_000,
  continueOnFailure: false,
};

/**
 * Create a contract for an agent step.
 *
 * @example
 * ```ts
 * const editContract = contract('edit-file', {
 *   pre: [fileExists('src/index.ts')],
 *   post: [testsPass('npm test')],
 *   invariant: [projectCompiles('npx tsc --noEmit')],
 * });
 *
 * const result = await editContract.execute(async () => {
 *   return await agent.edit('src/index.ts', instructions);
 * });
 * ```
 */
export function contract<T = unknown>(
  name: string,
  spec: ContractSpec,
  options?: ContractOptions,
): Contract<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    name,
    spec,
    options: opts,
    execute: (step) => executeContract<T>(name, spec, opts, step),
    verifyPre: () => runChecks(name, spec.pre ?? [], 'pre', opts),
    verifyPost: (snapshot) =>
      runChecks(name, spec.post ?? [], 'post', opts, snapshot),
    verifyInvariants: () =>
      runChecks(name, spec.invariant ?? [], 'invariant', opts),
  };
}

async function executeContract<T>(
  name: string,
  spec: ContractSpec,
  opts: Required<ContractOptions>,
  step: () => Promise<T>,
): Promise<ContractResult<T>> {
  const startTime = performance.now();
  const violations: Violation[] = [];

  // Notify reporters
  for (const reporter of opts.reporters) {
    await reporter.onStart?.(name);
  }

  // 1. Verify invariants BEFORE
  const invariantBefore = await runChecks(
    name, spec.invariant ?? [], 'invariant', opts,
  );
  collectViolations(name, invariantBefore, violations);

  if (!invariantBefore.passed && !opts.continueOnFailure) {
    return buildResult<T>(name, undefined, undefined, {
      pre: emptyResult(),
      post: emptyResult(),
      invariantBefore,
      invariantAfter: emptyResult(),
    }, violations, startTime, opts);
  }

  // 2. Verify preconditions
  const pre = await runChecks(name, spec.pre ?? [], 'pre', opts);
  collectViolations(name, pre, violations);

  if (!pre.passed && !opts.continueOnFailure) {
    return buildResult<T>(name, undefined, undefined, {
      pre,
      post: emptyResult(),
      invariantBefore,
      invariantAfter: emptyResult(),
    }, violations, startTime, opts);
  }

  // 3. Execute the step
  let value: T | undefined;
  let stepError: Error | undefined;

  try {
    value = await step();
  } catch (err) {
    stepError = err instanceof Error ? err : new Error(String(err));
  }

  // 4. Verify postconditions (even if step failed — captures state)
  const post = await runChecks(name, spec.post ?? [], 'post', opts);
  collectViolations(name, post, violations);

  // 5. Verify invariants AFTER
  const invariantAfter = await runChecks(
    name, spec.invariant ?? [], 'invariant', opts,
  );
  collectViolations(name, invariantAfter, violations);

  return buildResult<T>(name, value, stepError, {
    pre, post, invariantBefore, invariantAfter,
  }, violations, startTime, opts);
}

async function runChecks(
  contractName: string,
  checks: Check[],
  phase: CheckPhase,
  opts: Required<ContractOptions>,
  snapshot?: StateSnapshot,
): Promise<VerificationResult> {
  const phaseStart = performance.now();
  const results: CheckResultWithMeta[] = [];
  let allPassed = true;

  for (const check of checks) {
    const ctx: CheckContext = {
      contractName,
      phase,
      snapshot,
      params: {},
      cwd: opts.cwd,
    };

    const checkStart = performance.now();
    let result: CheckResult;

    try {
      result = await withTimeout(check.verify(ctx), opts.checkTimeout, check.name);
    } catch (err) {
      result = {
        passed: false,
        message: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: performance.now() - checkStart,
      };
    }

    const meta: CheckResultWithMeta = {
      ...result,
      checkName: check.name,
      checkDescription: check.description,
      phase,
    };

    results.push(meta);

    // Notify reporters
    for (const reporter of opts.reporters) {
      await reporter.onCheck?.(meta);
    }

    if (!result.passed) {
      allPassed = false;
      if (!opts.continueOnFailure) break;
    }
  }

  return {
    passed: allPassed,
    checks: results,
    durationMs: performance.now() - phaseStart,
  };
}

function collectViolations(
  contractName: string,
  result: VerificationResult,
  violations: Violation[],
): void {
  for (const check of result.checks) {
    if (!check.passed) {
      const violation: Violation = {
        contractName,
        phase: check.phase,
        checkName: check.checkName,
        message: check.message,
        details: check.details,
        timestamp: new Date().toISOString(),
      };
      violations.push(violation);
    }
  }
}

async function buildResult<T>(
  contractName: string,
  value: T | undefined,
  stepError: Error | undefined,
  verification: ContractResult<T>['verification'],
  violations: Violation[],
  startTime: number,
  opts: Required<ContractOptions>,
): Promise<ContractResult<T>> {
  const success =
    !stepError &&
    verification.pre.passed &&
    verification.post.passed &&
    verification.invariantBefore.passed &&
    verification.invariantAfter.passed;

  const result: ContractResult<T> = {
    success,
    value,
    stepError,
    verification,
    violations,
    durationMs: performance.now() - startTime,
  };

  // Notify reporters
  for (const reporter of opts.reporters) {
    await reporter.onComplete?.(result);
  }

  // Report violations
  for (const violation of violations) {
    for (const reporter of opts.reporters) {
      await reporter.onViolation?.(violation);
    }
  }

  // Handle violation action
  if (violations.length > 0) {
    handleViolationAction(opts.onViolation, violations, contractName);
  }

  return result;
}

function handleViolationAction(
  action: ViolationAction,
  violations: Violation[],
  contractName: string,
): void {
  const summary = violations
    .map((v) => `  [${v.phase}] ${v.checkName}: ${v.message}`)
    .join('\n');

  const msg = `Contract "${contractName}" violated:\n${summary}`;

  switch (action) {
    case 'throw':
      throw new ContractViolationError(msg, violations);
    case 'warn':
      console.warn(`⚠️ ${msg}`);
      break;
    case 'report':
      // Silently collected in result — reporters handle output
      break;
  }
}

function emptyResult(): VerificationResult {
  return { passed: true, checks: [], durationMs: 0 };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Check "${label}" timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Error thrown when a contract is violated and onViolation is 'throw'.
 */
export class ContractViolationError extends Error {
  public readonly violations: Violation[];

  constructor(message: string, violations: Violation[]) {
    super(message);
    this.name = 'ContractViolationError';
    this.violations = violations;
  }
}
