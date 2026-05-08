import * as fs from 'node:fs/promises';
import type { Contract, ContractOptions, ContractSpec, ContractYAML, Check } from '../core/types.js';
import { contract } from '../core/contract.js';
import { registry } from '../core/registry.js';

/**
 * Parse a YAML contract definition string into a ContractSpec.
 * Uses a minimal YAML parser (no dependencies) for simple contract files.
 *
 * Supports the format:
 * ```yaml
 * name: edit-function
 * pre:
 *   - check: file-exists
 *     params:
 *       path: src/utils.ts
 * post:
 *   - check: tests-pass
 *     params:
 *       cmd: npm test
 * invariant:
 *   - check: project-compiles
 *     params:
 *       cmd: npx tsc --noEmit
 * ```
 */
export function parseContractYAML(yamlContent: string): ContractYAML {
  // Minimal YAML-like parser for contract files
  // Handles: name, pre/post/invariant arrays of {check, params}
  const lines = yamlContent.split('\n');
  const result: ContractYAML = { name: '' };
  let currentSection: 'pre' | 'post' | 'invariant' | null = null;
  let currentCheck: { check: string; params?: Record<string, unknown> } | null = null;
  let inParams = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // Top-level name
    if (line.startsWith('name:')) {
      result.name = line.slice(5).trim();
      continue;
    }

    // Section headers
    if (line === 'pre:' || line === 'post:' || line === 'invariant:') {
      if (currentCheck) {
        pushCheck(result, currentSection!, currentCheck);
        currentCheck = null;
      }
      currentSection = line.slice(0, -1) as 'pre' | 'post' | 'invariant';
      inParams = false;
      continue;
    }

    // Check item
    if (line.match(/^\s{2}- check:/)) {
      if (currentCheck && currentSection) {
        pushCheck(result, currentSection, currentCheck);
      }
      currentCheck = { check: line.replace(/^\s{2}- check:\s*/, '') };
      inParams = false;
      continue;
    }

    // Params header
    if (line.match(/^\s{4}params:/) && currentCheck) {
      inParams = true;
      currentCheck.params = {};
      continue;
    }

    // Param value
    if (inParams && currentCheck?.params && line.match(/^\s{6}\w+:/)) {
      const match = line.match(/^\s{6}(\w+):\s*(.+)/);
      if (match) {
        const [, key, value] = match;
        currentCheck.params[key!] = parseValue(value!);
      }
      continue;
    }
  }

  // Flush last check
  if (currentCheck && currentSection) {
    pushCheck(result, currentSection, currentCheck);
  }

  return result;
}

function pushCheck(
  result: ContractYAML,
  section: 'pre' | 'post' | 'invariant',
  check: { check: string; params?: Record<string, unknown> },
): void {
  if (!result[section]) result[section] = [];
  result[section]!.push(check);
}

function parseValue(str: string): unknown {
  const trimmed = str.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;
  // Remove quotes if present
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Load a contract from a YAML file.
 */
export async function loadContract(
  filePath: string,
  options?: ContractOptions,
): Promise<Contract> {
  const content = await fs.readFile(filePath, 'utf-8');
  return fromYAML(content, options);
}

/**
 * Create a contract from a YAML string.
 */
export function fromYAML(
  yamlContent: string,
  options?: ContractOptions,
): Contract {
  const parsed = parseContractYAML(yamlContent);

  const spec: ContractSpec = {
    pre: parsed.pre?.map((c) => registry.fromSpec(c)) ?? [],
    post: parsed.post?.map((c) => registry.fromSpec(c)) ?? [],
    invariant: parsed.invariant?.map((c) => registry.fromSpec(c)) ?? [],
  };

  return contract(parsed.name, spec, { ...parsed.options, ...options });
}
