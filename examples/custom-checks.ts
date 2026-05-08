/**
 * Example: Custom checks and composable verification logic.
 *
 * Shows how to create domain-specific checks and compose them
 * using allOf(), anyOf(), and not() combinators.
 */

import {
  contract,
  createCheck,
  check,
  allOf,
  anyOf,
  not,
  fileExists,
  fileContains,
  consoleReporter,
} from '@phoenixaihub/agent-contracts';

// Custom check: verify a database has minimum rows
const dbHasRows = createCheck('db-has-rows', async (ctx) => {
  // In a real scenario, query your database
  const rowCount = 150; // simulated
  const min = (ctx.params.min as number) ?? 100;
  return {
    passed: rowCount >= min,
    message: rowCount >= min
      ? `Database has ${rowCount} rows (≥${min})`
      : `Database only has ${rowCount} rows (need ≥${min})`,
    durationMs: 0,
  };
}, {
  description: 'Verify minimum database row count',
  params: { min: { type: 'number' } },
});

// Simple boolean check
const isBusinessHours = check('is-business-hours', () => {
  const hour = new Date().getHours();
  return hour >= 9 && hour < 17;
}, 'Current time is within business hours (9-5)');

// Compose checks
const safeToMigrate = allOf('safe-to-migrate', [
  fileExists('migrations/latest.sql'),
  not(fileContains('migrations/latest.sql', 'DROP TABLE')),
]);

const hasBackup = anyOf('has-backup', [
  fileExists('backups/latest.sql.gz'),
  fileExists('backups/latest.dump'),
  check('s3-backup-exists', async () => {
    // Check S3 for backup
    return true; // simulated
  }),
]);

// Build the contract
const migrationContract = contract('run-migration', {
  pre: [
    safeToMigrate,
    hasBackup,
    dbHasRows,
  ],
  post: [
    check('migration-applied', () => true, 'Migration was applied'),
  ],
}, {
  reporters: [consoleReporter({ verbose: true })],
  onViolation: 'report', // collect but don't throw
  continueOnFailure: true, // check ALL conditions
});

async function main() {
  const result = await migrationContract.execute(async () => {
    console.log('Running database migration...');
    return 'migration complete';
  });

  console.log('\nResult:', JSON.stringify({
    success: result.success,
    totalViolations: result.violations.length,
    phases: {
      pre: result.verification.pre.passed,
      post: result.verification.post.passed,
    },
  }, null, 2));
}

main().catch(console.error);
