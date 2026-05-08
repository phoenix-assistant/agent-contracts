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
} from './types.js';

export { contract, ContractViolationError } from './contract.js';
export { registry, registerCheck } from './registry.js';
