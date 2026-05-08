/**
 * @phoenixaihub/agent-contracts
 *
 * Design by Contract for AI Agent Steps.
 * Runtime preconditions, postconditions, and invariants for agent execution.
 *
 * @example
 * ```ts
 * import { contract, fileExists, testsPass, projectCompiles } from '@phoenixaihub/agent-contracts';
 *
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

// Core
export { contract, ContractViolationError } from './core/contract.js';
export { registry, registerCheck } from './core/registry.js';

// Types (re-export all)
export type {
  Check,
  CheckContext,
  CheckFactory,
  CheckPhase,
  CheckRegistry,
  CheckResult,
  CheckResultWithMeta,
  CheckYAML,
  Contract,
  ContractOptions,
  ContractResult,
  ContractSpec,
  ContractYAML,
  Reporter,
  StateSnapshot,
  VerificationResult,
  Violation,
  ViolationAction,
} from './core/types.js';

// Built-in checks
export {
  // File
  fileExists,
  fileNotExists,
  fileContains,
  fileNotContains,
  fileParseable,
  fileSizeWithin,
  fileUnchanged,
  // Process
  commandSucceeds,
  commandOutputContains,
  testsPass,
  projectCompiles,
  noNewLintErrors,
  // Git
  noUnstagedChanges,
  onlyFilesChanged,
  noOtherFilesChanged,
  commitMessageMatches,
  // Custom
  createCheck,
  check,
  allOf,
  anyOf,
  not,
} from './checks/index.js';

// Reporters
export {
  consoleReporter,
  jsonReporter,
  githubActionsReporter,
  callbackReporter,
} from './reporters/index.js';

// DSL
export { parseContractYAML, loadContract, fromYAML } from './dsl/index.js';
