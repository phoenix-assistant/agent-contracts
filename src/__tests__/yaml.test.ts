import { describe, it, expect } from 'vitest';
import { parseContractYAML } from '../dsl/yaml.js';

describe('YAML DSL Parser', () => {
  it('parses a basic contract', () => {
    const yaml = `
name: edit-function
pre:
  - check: file-exists
    params:
      path: src/utils.ts
post:
  - check: tests-pass
    params:
      cmd: npm test
invariant:
  - check: project-compiles
    params:
      cmd: npx tsc --noEmit
`;

    const result = parseContractYAML(yaml);
    expect(result.name).toBe('edit-function');
    expect(result.pre).toHaveLength(1);
    expect(result.pre![0]!.check).toBe('file-exists');
    expect(result.pre![0]!.params).toEqual({ path: 'src/utils.ts' });
    expect(result.post).toHaveLength(1);
    expect(result.post![0]!.check).toBe('tests-pass');
    expect(result.invariant).toHaveLength(1);
  });

  it('parses multiple checks per phase', () => {
    const yaml = `
name: multi-check
pre:
  - check: file-exists
    params:
      path: a.txt
  - check: file-exists
    params:
      path: b.txt
`;

    const result = parseContractYAML(yaml);
    expect(result.pre).toHaveLength(2);
  });

  it('handles numeric and boolean params', () => {
    const yaml = `
name: typed-params
pre:
  - check: file-size-within
    params:
      path: test.txt
      min: 100
      max: 5000
`;

    const result = parseContractYAML(yaml);
    expect(result.pre![0]!.params!.min).toBe(100);
    expect(result.pre![0]!.params!.max).toBe(5000);
  });

  it('skips comments and empty lines', () => {
    const yaml = `
# This is a comment
name: with-comments

# Pre section
pre:
  # Check file
  - check: file-exists
    params:
      path: test.txt
`;

    const result = parseContractYAML(yaml);
    expect(result.name).toBe('with-comments');
    expect(result.pre).toHaveLength(1);
  });
});
