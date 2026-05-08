/**
 * Example: Protecting an AI agent's file editing step with contracts.
 *
 * This shows how to wrap an agent step that modifies source code,
 * ensuring preconditions are met before editing and postconditions
 * are verified after.
 */

import {
  contract,
  fileExists,
  fileContains,
  fileParseable,
  commandSucceeds,
  consoleReporter,
} from '@phoenixaihub/agent-contracts';

// Define the contract for editing a TypeScript function
const editFunctionContract = contract('edit-function', {
  // BEFORE the agent acts: verify the target exists and is valid
  pre: [
    fileExists('src/utils.ts'),
    fileParseable('src/utils.ts', 'typescript'),
    fileContains('src/utils.ts', 'calculateTotal'),
  ],

  // AFTER the agent acts: verify the edit was correct
  post: [
    fileContains('src/utils.ts', 'calculateTotal'),     // function still exists
    fileContains('src/utils.ts', 'formatCurrency'),      // other functions untouched
    commandSucceeds('npx tsc --noEmit'),                 // still compiles
  ],

  // ALWAYS true: checked before AND after
  invariant: [
    commandSucceeds('npx tsc --noEmit'),                 // project compiles
  ],
}, {
  reporters: [consoleReporter({ verbose: true })],
  onViolation: 'throw',  // halt on any violation
});

// Execute the agent step under contract protection
async function main() {
  try {
    const result = await editFunctionContract.execute(async () => {
      // This is where your agent modifies the file.
      // If ANY precondition fails, this never runs.
      // If ANY postcondition or invariant fails after, you get a structured error.

      console.log('Agent is editing src/utils.ts...');
      // agent.edit('src/utils.ts', 'Add error handling to calculateTotal');
      return 'edited successfully';
    });

    console.log('Contract result:', {
      success: result.success,
      value: result.value,
      violations: result.violations.length,
      durationMs: Math.round(result.durationMs),
    });
  } catch (error) {
    console.error('Contract violation — step was blocked or rolled back');
    console.error(error);
    process.exit(1);
  }
}

main();
