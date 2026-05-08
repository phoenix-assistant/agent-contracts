# Contributing to Agent Contracts

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/phoenix-assistant/agent-contracts.git
cd agent-contracts
npm install
npm run dev      # watch mode
npm test         # run tests
npm run typecheck # type checking
```

## Adding a New Check

1. Create a file in `src/checks/` or add to an existing category
2. Export a factory function that returns a `Check` object
3. Register it in the global registry with `registry.register()`
4. Add it to `src/checks/index.ts` exports
5. Write tests in `src/__tests__/`
6. Document it in the README

### Check Template

```typescript
import type { Check } from '../core/types.js';
import { registry } from '../core/registry.js';

export function myCheck(param: string): Check {
  return {
    name: 'my-check',
    description: `My check: ${param}`,
    verify: async (ctx) => {
      const start = performance.now();
      // Your verification logic here
      const passed = true; // your logic
      return {
        passed,
        message: passed ? 'Passed' : 'Failed',
        durationMs: performance.now() - start,
      };
    },
  };
}

registry.register('my-check', (p: unknown) => myCheck(p as string));
```

## Pull Requests

- Keep PRs focused on a single change
- Include tests for new functionality
- Run `npm run typecheck && npm test` before submitting
- Update README if adding user-facing features

## Code Style

- TypeScript strict mode
- No `any` types (use `unknown` + type narrowing)
- Functional style preferred over classes
- All public APIs need JSDoc comments
