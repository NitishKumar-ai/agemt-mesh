import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest base for every workspace package. Each package's
 * `vitest.config.ts` should `mergeConfig(sharedConfig, …)` or re-export this.
 * Globs are resolved relative to the package that imports it.
 */
export const sharedConfig = defineConfig({
  test: {
    include: ['src/test/**/*.test.ts', 'tests/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Packages not yet ported have no tests; don't fail the pipeline for them.
    passWithNoTests: true,
  },
});

export default sharedConfig;
