# Agent Contracts — Design by Contract for AI Agent Steps

> Runtime preconditions, postconditions, and invariants for AI agent execution. Catch silent corruption the moment it happens.

## Problem

AI agents execute multi-step workflows where each step can silently corrupt state. An agent modifies the wrong file, introduces a syntax error, or changes something it shouldn't have touched — and nobody notices until the end of the run (or worse, production).

Current solutions:
- **Guardrails** tell agents what they CAN'T do (input/output validation, content filters)
- **Specs/evals** verify AFTER the full run whether the output matches intent
- **Prompt engineering** asks the LLM to "be careful" (unreliable)

**Nobody verifies correctness DURING execution, step by step, with deterministic checks.**

## Solution

Agent Contracts brings Bertrand Meyer's Design by Contract (1986) to AI agent execution:

```typescript
import { contract, pre, post, invariant } from '@phoenixaihub/agent-contracts';

const editFunction = contract('edit-function', {
  pre: [
    fileExists('src/utils.ts'),
    fileParseable('src/utils.ts', 'typescript'),
    functionExists('src/utils.ts', 'calculateTotal'),
  ],
  post: [
    functionModified('src/utils.ts', 'calculateTotal'),
    noOtherFunctionsChanged('src/utils.ts', 'calculateTotal'),
    testsPass('npm test'),
  ],
  invariant: [
    projectCompiles('npx tsc --noEmit'),
    noNewLintErrors('npx eslint src/'),
  ],
});

// Wrap your agent step
const result = await editFunction.execute(async () => {
  return await agent.editFile('src/utils.ts', instructions);
});
```

**Key insight:** Contracts are deterministic, programmatic checks. No LLM in the verification loop. A `fileExists` check either passes or fails — no hallucination possible.

## Why Now

| Signal | Evidence |
|--------|----------|
| "Agents need control flow, not more prompts" | 484 HN points (May 7, 2026) |
| Normalization of deviance | Simon Willison: "I'm not reviewing every line anymore" |
| Production incidents | Coinbase major outage day after CEO said non-engineers shipping code with AI |
| Spec-first momentum | Ouroboros (3.7K⭐) validates specs but evaluation is post-hoc |
| Context discipline trending | context-mode (14K⭐, 2.4K downloads/week) |

The industry is rapidly adopting AI agents for code changes, but the verification layer between "agent acted" and "action was correct" doesn't exist yet.

## Market Landscape

| Tool | What It Does | Gap |
|------|-------------|-----|
| **Guardrails AI** | Input/output validation for LLM calls | Prompt-level, not step-level. Validates format, not correctness. |
| **Ouroboros** | Spec-first agent development | Post-hoc evaluation. Checks at the end, not during. |
| **NeMo Guardrails** | Conversational rails (NVIDIA) | Dialog safety, not code execution verification. |
| **LangSmith** | Observability & tracing | Sees what happened. Doesn't prevent bad steps. |
| **Pydantic AI** | Type-safe agent framework | Validates data shapes, not execution side-effects. |
| **Agent Contracts** | **Runtime step contracts** | **Verifies correctness DURING execution with deterministic checks** |

## Technical Architecture

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
│  │  @pre() │ │ @post()  │ │ @invariant()│  │
│  └────┬────┘ └────┬─────┘ └──────┬──────┘  │
│       │           │              │          │
│       ▼           ▼              ▼          │
│  ┌─────────────────────────────────────┐    │
│  │        Verification Engine          │    │
│  │  • Snapshot state before step       │    │
│  │  • Run precondition checks          │    │
│  │  • Execute agent step               │    │
│  │  • Run postcondition checks         │    │
│  │  • Verify invariants hold           │    │
│  │  • Emit structured violation report │    │
│  └─────────────────────────────────────┘    │
│                    │                         │
│                    ▼                         │
│  ┌─────────────────────────────────────┐    │
│  │         Contract Registry           │    │
│  │  • YAML / TypeScript DSL            │    │
│  │  • Built-in check library           │    │
│  │  • Custom check plugins             │    │
│  └─────────────────────────────────────┘    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│            Violation Reporter               │
│  • Structured JSON reports                  │
│  • CI integration (exit codes)              │
│  • GitHub Action annotations                │
│  • Console / file / webhook output          │
└─────────────────────────────────────────────┘
```

## Build Plan

| Week | Milestone | Deliverables |
|------|-----------|-------------|
| 1 | Core Engine | Contract runtime, pre/post/invariant decorators, verification engine, built-in checks (file, process, git) |
| 2 | DSL & Registry | YAML contract definitions, contract registry, check plugin system, TypeScript DSL |
| 3 | Integrations & CI | GitHub Action, CLI runner, LangChain/CrewAI adapters, structured reporters |
| 4 | Polish & Ship | Comprehensive tests, documentation, examples, npm publish, v0.1.0 release |

## Built-in Check Library

### File Checks
- `fileExists(path)` — File exists at path
- `fileNotExists(path)` — File does not exist
- `fileParseable(path, language)` — File parses without syntax errors
- `fileContains(path, content)` — File contains string/regex
- `fileMatchesSnapshot(path)` — File matches saved snapshot
- `fileSizeWithin(path, min, max)` — File size in range

### Git Checks
- `noUnstagedChanges()` — Working tree clean
- `onlyFilesChanged(patterns)` — Only specific files modified
- `noOtherFilesChanged(patterns)` — Specific files NOT modified
- `commitMessageMatches(pattern)` — Commit message format

### Process Checks
- `commandSucceeds(cmd)` — Command exits 0
- `commandOutputContains(cmd, expected)` — Command output matches
- `testsPass(cmd)` — Test suite passes
- `projectCompiles(cmd)` — Compilation succeeds
- `noNewLintErrors(cmd)` — No new lint violations

### Function Checks
- `functionExists(file, name)` — Function/method exists in file
- `functionModified(file, name)` — Function was changed
- `noOtherFunctionsChanged(file, except)` — Only target function changed
- `exportExists(file, name)` — Module export exists

### Custom Checks
```typescript
import { Check } from '@phoenixaihub/agent-contracts';

const dbRowCount = Check.create('db-row-count', async (ctx) => {
  const count = await db.query('SELECT COUNT(*) FROM users');
  return count >= ctx.params.min;
}, { params: { min: { type: 'number' } } });
```

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Contracts too verbose for adoption | Medium | YAML DSL, sensible defaults, preset contract packs |
| Performance overhead per step | Low | Checks are simple I/O ops; async parallel where possible |
| Framework integration complexity | Medium | Start with generic wrapper, add framework-specific adapters later |
| "Just use tests" objection | High | Clear messaging: contracts verify agent BEHAVIOR, tests verify code CORRECTNESS. Orthogonal. |

## Monetization Path

1. **Open core** — Core runtime, built-in checks, CLI: MIT open source
2. **Pro checks** — Advanced checks (AST diff, semantic code comparison, security scanning): paid
3. **Cloud dashboard** — Centralized contract violation monitoring across teams: SaaS
4. **Enterprise** — Custom check development, on-prem, SSO: enterprise license

## Verdict

### 🟢 BUILD

**Why:**
- Clear gap: nobody does runtime step-level verification for agents
- Grounded in established CS (DbC, 1986) — not hype
- Pain is real and growing (Coinbase incident, Willison quote)
- Low technical risk (deterministic checks, no ML needed)
- High signal from adjacent tools (Ouroboros 3.7K⭐, context-mode 14K⭐)
- First-mover advantage in a category that WILL exist
