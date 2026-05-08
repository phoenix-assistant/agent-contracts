// File checks
export {
  fileExists,
  fileNotExists,
  fileContains,
  fileNotContains,
  fileParseable,
  fileSizeWithin,
  fileUnchanged,
} from './file.js';

// Process checks
export {
  commandSucceeds,
  commandOutputContains,
  testsPass,
  projectCompiles,
  noNewLintErrors,
} from './process.js';

// Git checks
export {
  noUnstagedChanges,
  onlyFilesChanged,
  noOtherFilesChanged,
  commitMessageMatches,
} from './git.js';

// Custom check builders
export {
  createCheck,
  check,
  allOf,
  anyOf,
  not,
} from './custom.js';
