import type { Check, CheckFactory, CheckRegistry as ICheckRegistry, CheckYAML } from './types.js';

/**
 * Global registry of check factories.
 * Checks can be registered by name and instantiated from YAML specs.
 */
class Registry implements ICheckRegistry {
  private factories = new Map<string, CheckFactory>();

  register(name: string, factory: CheckFactory): void {
    this.factories.set(name, factory);
  }

  get(name: string): CheckFactory | undefined {
    return this.factories.get(name);
  }

  list(): string[] {
    return [...this.factories.keys()];
  }

  fromSpec(spec: CheckYAML): Check {
    const factory = this.factories.get(spec.check);
    if (!factory) {
      throw new Error(
        `Unknown check "${spec.check}". Available: ${this.list().join(', ')}`,
      );
    }

    // Pass params as individual arguments if they exist
    if (spec.params) {
      const args = Object.values(spec.params);
      return factory(...args);
    }
    return factory();
  }
}

/** Global check registry singleton */
export const registry = new Registry();

/**
 * Register a check factory in the global registry.
 *
 * @example
 * ```ts
 * registerCheck('file-exists', (path: string) => ({
 *   name: 'file-exists',
 *   description: `File exists: ${path}`,
 *   verify: async () => { ... }
 * }));
 * ```
 */
export function registerCheck(name: string, factory: CheckFactory): void {
  registry.register(name, factory);
}
