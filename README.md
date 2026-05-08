# Agent Contracts

[![npm version](https://img.shields.io/npm/v/@phoenixaihub/agent-contracts)](https://www.npmjs.com/package/@phoenixaihub/agent-contracts)
[![CI](https://github.com/phoenix-assistant/agent-contracts/actions/workflows/ci.yml/badge.svg)](https://github.com/phoenix-assistant/agent-contracts/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)

**Design by Contract for AI Agent Steps.**

Runtime preconditions, postconditions, and invariants for agent execution. Catch silent corruption the moment it happens — not after the full run.

```typescript
import { contract, fileExists, testsPass, projectCompiles } from '@phoenixaihub/agent-contracts';

const editContract = contract('edit-function', {
  pre: [fileExists('src/utils.ts'), fileContains('src/utils.ts', 'calculateTotal')],
  post: [testsPass('npm test')],
  invariant: [projectCompiles('npx tsc --noEmit')],
});

const result = await editContract.execute(async () => {
  return await agent.edit('src/utils.ts', instructions);
});
// If ANY check fails → ContractViolationError with structured diagnostics
```

## Why

AI agents execute multi-step workflows. Each step can silently corrupt state: modify the wrong file, introduce syntax errors, break something unrelated. Current tools don't catch this:

| Tool | What It Does | The Gap |
|------|-------------|---------|
| **Guardrails AI** | Input/output validation | Validates format, not execution correctness |
| **Ouroboros** | Spec-first agents | Post-hoc evaluation — checks at the end |
| **NeMo Guardrails** | Conversational rails | Dialog safety, not code verification |
| **LangSmith** | Observability | Sees what happened, doesn't prevent bad steps |
| **Pydantic AI** | Type-safe agents | Validates data shapes, not side-effects |
| **Agent Contracts** | **Step-level contracts** | **Verifies correctness DURING execution** |

Agent Contracts brings [Bertrand Meyer's Design by Contract](https://en.wikipedia.org/wiki/Design_by_contract) (1986) to AI agents. Contracts are **deterministic, programmatic checks** — no LLM in the verification loop.

## Install

```bash
npm install @phoenixaihub/agent-contracts
```

## Quick Start

### 1. Define a Contract

```typescript
import {
  contract,
  fileExists,
  fileContains,
  commandSucceeds,
  consoleReporter,
} from '@phoenixaihub/agent-contracts';

const editContract = contract('edit-function', {
  // Must be true BEFORE the step runs
  pre: [
    fileExists('src/utils.ts'),
    fileContains('src/utils.ts', 'calculateTotal'),
  ],
  // Must be true AFTER the step runs
  post: [
    fileContains('src/utils.ts', 'calculateTotal'),  // function still exists
    commandSucceeds('npm test'),                       // tests still pass
  ],
  // Must be true BEFORE and AFTER
  invariant: [
    commandSucceeds('npx tsc --noEmit'),  // always compiles
  ],
}, {
  reporters: [consoleReporter({ verbose: true })],
  onViolation: 'throw',
});
```

### 2. Execute Under Contract

```typescript
const result = await editContract.execute(async () => {
  // Your agent step here
  return await agent.edit('src/utils.ts', 'Add error handling');
});

console.log(result.success);      // true if all checks passed
console.log(result.violations);   // [] if clean
console.log(result.durationMs);   // total time including checks
```

### 3. Handle Violations

```typescript
import { ContractViolationError } from '@phoenixaihub/agent-contracts';

try {
  await editContract.execute(async () => { /* ... */ });
} catch (err) {
  if (err instanceof ContractViolationError) {
    for (const v of err.violations) {
      console.error(`[${v.phase}] ${v.checkName}: ${v.message}`);
    }
  }
}
```

## Built-in Checks

### File Checks

| Check | Description |
|-------|-------------|
| `fileExists(path)` | File exists |
| `fileNotExists(path)` | File does not exist |
| `fileContains(path, pattern)` | File contains string or regex |
| `fileNotContains(path, pattern)` | File does NOT contain string or regex |
| `fileParseable(path, language)` | File parses as json or typescript |
| `fileSizeWithin(path, min, max)` | File size within byte range |
| `fileUnchanged(path)` | File unchanged between invariant checks |

### Process Checks

| Check | Description |
|-------|-------------|
| `commandSucceeds(cmd)` | Command exits 0 |
| `commandOutputContains(cmd, pattern)` | Command output contains string/regex |
| `testsPass(cmd)` | Test suite passes (semantic alias) |
| `projectCompiles(cmd)` | Compilation succeeds (semantic alias) |
| `noNewLintErrors(cmd)` | No new lint violations |

### Git Checks

| Check | Description |
|-------|-------------|
| `noUnstagedChanges()` | Working tree clean |
| `onlyFilesChanged(patterns)` | Only specific files modified |
| `noOtherFilesChanged(patterns)` | Protected files NOT modified |
| `commitMessageMatches(pattern)` | Commit message matches format |

### Custom Checks

```typescript
import { createCheck, check, allOf, anyOf, not } from '@phoenixaihub/agent-contracts';

// Simple boolean check
const isReady = check('is-ready', () => database.isConnected());

// Async check with structured result
const hasMinRows = createCheck('min-rows', async (ctx) => {
  const count = await db.count('users');
  return {
    passed: count >= 100,
    message: `${count} rows (need ≥100)`,
    durationMs: 0,
  };
});

// Composable
const safeToMigrate = allOf('safe-to-migrate', [
  fileExists('migrations/latest.sql'),
  not(fileContains('migrations/latest.sql', 'DROP TABLE')),
]);

const hasBackup = anyOf('has-backup', [
  fileExists('backups/latest.sql.gz'),
  fileExists('backups/latest.dump'),
]);
```

## YAML DSL

Define contracts in YAML files — no TypeScript needed for contract definitions:

```yaml
# contracts/edit-function.yaml
name: edit-function
pre:
  - check: file-exists
    params:
      path: src/utils.ts
  - check: file-parseable
    params:
      path: src/utils.ts
      language: typescript
post:
  - check: tests-pass
    params:
      cmd: npm test
invariant:
  - check: project-compiles
    params:
      cmd: npx tsc --noEmit
```

```typescript
import { loadContract } from '@phoenixaihub/agent-contracts';

const contract = await loadContract('contracts/edit-function.yaml');
const result = await contract.execute(async () => { /* ... */ });
```

## Reporters

| Reporter | Output |
|----------|--------|
| `consoleReporter()` | Formatted stdout/stderr |
| `jsonReporter({ outputPath })` | Structured JSON file |
| `githubActionsReporter()` | `::error` / `::warning` annotations |
| `callbackReporter({ onViolation })` | Custom callbacks |

```typescript
const c = contract('my-step', spec, {
  reporters: [
    consoleReporter({ verbose: true }),
    jsonReporter({ outputPath: 'contract-results.json' }),
    githubActionsReporter(),
  ],
});
```

## Violation Handling

| Mode | Behavior |
|------|----------|
| `'throw'` | Throws `ContractViolationError` (default) |
| `'warn'` | Logs warning, continues |
| `'report'` | Silent — violations collected in result |

```typescript
// Collect all violations without stopping
const c = contract('audit', spec, {
  onViolation: 'report',
  continueOnFailure: true,
});
const result = await c.execute(step);
console.log(`${result.violations.length} violations found`);
```

## Standalone Verification

Verify conditions without executing a step:

```typescript
const c = contract('check-state', {
  pre: [fileExists('config.json'), fileParseable('config.json', 'json')],
  invariant: [commandSucceeds('npx tsc --noEmit')],
});

// Check just preconditions
const preResult = await c.verifyPre();

// Check just invariants
const invResult = await c.verifyInvariants();
```

## Architecture

```
┌─────────────────────────────────────────────┐
│              Agent Framework                 │
│  (LangChain / CrewAI / AutoGen / OpenClaw)  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│           Contract Runtime                   │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  pre()  │ │  post()  │ │ invariant() │  │
│  └────┬────┘ └────┬─────┘ └──────┬──────┘  │
│       ▼           ▼              ▼          │
│  ┌─────────────────────────────────────┐    │
│  │        Verification Engine          │    │
│  │  1. Snapshot state                  │    │
│  │  2. Run preconditions               │    │
│  │  3. Execute agent step              │    │
│  │  4. Run postconditions              │    │
│  │  5. Verify invariants               │    │
│  │  6. Emit violation reports          │    │
│  └─────────────────────────────────────┘    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Reporters: Console | JSON | GitHub Actions │
└─────────────────────────────────────────────┘
```

## API Reference

### `contract(name, spec, options?)`

Create a contract for an agent step.

- **name** `string` — contract identifier
- **spec** `ContractSpec` — `{ pre?, post?, invariant? }` arrays of checks
- **options** `ContractOptions`:
  - `cwd` — working directory (default: `process.cwd()`)
  - `onViolation` — `'throw'` | `'warn'` | `'report'` (default: `'throw'`)
  - `reporters` — array of Reporter instances
  - `checkTimeout` — per-check timeout in ms (default: 30000)
  - `continueOnFailure` — check all conditions even after failure (default: false)

### `ContractResult<T>`

```typescript
{
  success: boolean;
  value?: T;                    // step return value
  stepError?: Error;            // error FROM the step
  violations: Violation[];      // all contract violations
  verification: {
    pre: VerificationResult;
    post: VerificationResult;
    invariantBefore: VerificationResult;
    invariantAfter: VerificationResult;
  };
  durationMs: number;
}
```

### `Violation`

```typescript
{
  contractName: string;
  phase: 'pre' | 'post' | 'invariant';
  checkName: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT — see [LICENSE](LICENSE).
