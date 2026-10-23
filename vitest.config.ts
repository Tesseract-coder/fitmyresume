import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts', 'worker/**/*.ts', 'src/lib/**/*.ts'],
      thresholds: {
        'shared/validator.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
