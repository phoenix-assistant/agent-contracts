/**
 * Example: Using YAML contracts for declarative step verification.
 *
 * Define contracts in YAML files, load and execute at runtime.
 * No TypeScript code needed for contract definition.
 */

import { fromYAML, consoleReporter } from '@phoenixaihub/agent-contracts';

// Define a contract using YAML DSL
const yamlContract = `
name: deploy-service
pre:
  - check: file-exists
    params:
      path: Dockerfile
  - check: file-parseable
    params:
      path: package.json
      language: json
  - check: tests-pass
    params:
      cmd: npm test
post:
  - check: command-succeeds
    params:
      cmd: docker build -t myapp:latest .
invariant:
  - check: file-exists
    params:
      path: package.json
`;

async function main() {
  // Parse YAML into a live contract
  const deployContract = fromYAML(yamlContract, {
    reporters: [consoleReporter({ verbose: true })],
    onViolation: 'throw',
  });

  // Execute under contract protection
  const result = await deployContract.execute(async () => {
    console.log('Deploying service...');
    return 'deployed';
  });

  console.log('Deployment:', result.success ? '✅ SUCCESS' : '❌ FAILED');
}

main().catch(console.error);
