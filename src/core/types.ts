/**
 * Core types for Agent Contracts.
 *
 * Design by Contract for AI agent steps:
 * - Preconditions: what must be true BEFORE a step runs
 * - Postconditions: what must be true AFTER a step runs
 * - Invariants: what must ALWAYS be true (checked before and after)
 */

// ── Check Types ──

export type CheckPhase = 'pre' | 'post' | 'invariant';

export interface CheckContext {
  /** Name of the contract being verified */
  contractName: string;
  /** Phase this check is running in */
  phase: CheckPhase;
  /** State snapshot taken before step execution */
  snapshot?: StateSnapshot;
  /** Arbitrary parameters passed to the check */
  params: Record<string, unknown>;
  /** Working directory for file/process checks */
  cwd: string;
}

export interface CheckResult {
  /** Whether the check passed */
  passed: boolean;
  /** Human-readable message */
  message: string;
  /** Detailed context for debugging */
  details?: Record<string, unknown>;
  /** How long the check took (ms) */
  durationMs: number;
}

export interface Check {
  /** Unique name for this check */
  name: string;
  /** Human-readable description */
  description: string;
  /** The verification function */
  verify: (ctx: CheckContext) => Promise<CheckResult>;
}

// ── Contract Types ──

export interface ContractSpec {
  /** Checks that must pass before the step */
  pre?: Check[];
  /** Checks that must pass after the step */
  post?: Check[];
  /** Checks that must pass both before and after the step */
  invariant?: Check[];
}

export interface ContractOptions {
  /** Working directory for file/process checks (default: process.cwd()) */
  cwd?: string;
  /** What to do on violation: 'throw' | 'report' | 'warn' (default: 'throw') */
  onViolation?: ViolationAction;
  /** Custom reporters to receive violation events */
  reporters?: Reporter[];
  /** Timeout for individual checks in ms (default: 30000) */
  checkTimeout?: number;
  /** Whether to continue checking after first failure (default: false) */
  continueOnFailure?: boolean;
}

export type ViolationAction = 'throw' | 'report' | 'warn';

export interface Contract<T = unknown> {
  /** Contract name */
  name: string;
  /** The contract specification */
  spec: ContractSpec;
  /** Options */
  options: Required<ContractOptions>;
  /** Execute a step under this contract */
  execute: (step: () => Promise<T>) => Promise<ContractResult<T>>;
  /** Verify only preconditions (useful for dry-run) */
  verifyPre: () => Promise<VerificationResult>;
  /** Verify only postconditions */
  verifyPost: (snapshot?: StateSnapshot) => Promise<VerificationResult>;
  /** Verify only invariants */
  verifyInvariants: () => Promise<VerificationResult>;
}

// ── Execution Results ──

export interface ContractResult<T = unknown> {
  /** Whether the step completed successfully with all contracts passing */
  success: boolean;
  /** The step's return value (if it completed) */
  value?: T;
  /** Error from the step itself (not contract violations) */
  stepError?: Error;
  /** All verification results */
  verification: {
    pre: VerificationResult;
    post: VerificationResult;
    invariantBefore: VerificationResult;
    invariantAfter: VerificationResult;
  };
  /** All violations across all phases */
  violations: Violation[];
  /** Total execution time including checks (ms) */
  durationMs: number;
}

export interface VerificationResult {
  /** Whether all checks in this phase passed */
  passed: boolean;
  /** Individual check results */
  checks: CheckResultWithMeta[];
  /** Total time for this verification phase (ms) */
  durationMs: number;
}

export interface CheckResultWithMeta extends CheckResult {
  /** Check name */
  checkName: string;
  /** Check description */
  checkDescription: string;
  /** Which phase this ran in */
  phase: CheckPhase;
}

export interface Violation {
  /** Contract name */
  contractName: string;
  /** Which phase failed */
  phase: CheckPhase;
  /** Which check failed */
  checkName: string;
  /** Human-readable failure message */
  message: string;
  /** Detailed failure context */
  details?: Record<string, unknown>;
  /** When the violation occurred */
  timestamp: string;
}

// ── State Snapshots ──

export interface StateSnapshot {
  /** File hashes at snapshot time */
  files: Map<string, string>;
  /** Arbitrary state captured by checks */
  custom: Map<string, unknown>;
  /** When the snapshot was taken */
  timestamp: string;
}

// ── Reporters ──

export interface Reporter {
  /** Reporter name */
  name: string;
  /** Called when contract execution starts */
  onStart?: (contractName: string) => void | Promise<void>;
  /** Called for each check result */
  onCheck?: (result: CheckResultWithMeta) => void | Promise<void>;
  /** Called when a violation occurs */
  onViolation?: (violation: Violation) => void | Promise<void>;
  /** Called when contract execution completes */
  onComplete?: (result: ContractResult) => void | Promise<void>;
}

// ── DSL Types ──

export interface ContractYAML {
  name: string;
  pre?: CheckYAML[];
  post?: CheckYAML[];
  invariant?: CheckYAML[];
  options?: Partial<ContractOptions>;
}

export interface CheckYAML {
  check: string;
  params?: Record<string, unknown>;
}

// ── Check Factory ──

export interface CheckFactory {
  /** Create a check instance with the given parameters */
  (...args: unknown[]): Check;
}

// ── Registry ──

export interface CheckRegistry {
  /** Register a check factory by name */
  register: (name: string, factory: CheckFactory) => void;
  /** Get a check factory by name */
  get: (name: string) => CheckFactory | undefined;
  /** List all registered check names */
  list: () => string[];
  /** Create a check from a YAML spec */
  fromSpec: (spec: CheckYAML) => Check;
}
