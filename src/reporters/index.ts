import type { CheckResultWithMeta, ContractResult, Reporter, Violation } from '../core/types.js';

/**
 * Console reporter — logs contract results to stdout with formatting.
 */
export function consoleReporter(options?: { verbose?: boolean }): Reporter {
  const verbose = options?.verbose ?? false;

  return {
    name: 'console',
    onStart: (contractName) => {
      console.log(`\n📋 Contract: ${contractName}`);
    },
    onCheck: (result) => {
      if (verbose || !result.passed) {
        const icon = result.passed ? '✅' : '❌';
        console.log(`  ${icon} [${result.phase}] ${result.checkName}: ${result.message} (${result.durationMs.toFixed(0)}ms)`);
      }
    },
    onViolation: (violation) => {
      console.error(`  🚨 VIOLATION [${violation.phase}] ${violation.checkName}: ${violation.message}`);
    },
    onComplete: (result) => {
      const icon = result.success ? '✅' : '❌';
      const violationCount = result.violations.length;
      console.log(`${icon} Contract ${result.success ? 'PASSED' : 'FAILED'} (${result.durationMs.toFixed(0)}ms, ${violationCount} violation${violationCount !== 1 ? 's' : ''})\n`);
    },
  };
}

/**
 * JSON reporter — collects results and outputs structured JSON.
 */
export function jsonReporter(options?: { outputPath?: string }): Reporter & { getReport: () => ContractResult[] } {
  const reports: ContractResult[] = [];

  return {
    name: 'json',
    onComplete: async (result) => {
      reports.push(result);
      if (options?.outputPath) {
        const fs = await import('node:fs/promises');
        await fs.writeFile(
          options.outputPath,
          JSON.stringify(reports, null, 2),
          'utf-8',
        );
      }
    },
    getReport: () => [...reports],
  };
}

/**
 * GitHub Actions reporter — emits ::error and ::warning annotations.
 */
export function githubActionsReporter(): Reporter {
  return {
    name: 'github-actions',
    onViolation: (violation) => {
      console.log(
        `::error title=Contract Violation [${violation.phase}]::${violation.checkName}: ${violation.message}`,
      );
    },
    onComplete: (result) => {
      if (result.success) {
        console.log(`::notice title=Contract Passed::All checks passed (${result.durationMs.toFixed(0)}ms)`);
      } else {
        const summary = result.violations
          .map((v) => `[${v.phase}] ${v.checkName}: ${v.message}`)
          .join(' | ');
        console.log(`::error title=Contract Failed::${summary}`);
      }
    },
  };
}

/**
 * Callback reporter — fires user-defined callbacks for each event.
 */
export function callbackReporter(callbacks: {
  onViolation?: (violation: Violation) => void | Promise<void>;
  onComplete?: (result: ContractResult) => void | Promise<void>;
  onCheck?: (result: CheckResultWithMeta) => void | Promise<void>;
}): Reporter {
  return {
    name: 'callback',
    onCheck: callbacks.onCheck,
    onViolation: callbacks.onViolation,
    onComplete: callbacks.onComplete,
  };
}
