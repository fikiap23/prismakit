import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/dist/**',
        '**/*.d.ts',
        'packages/benchmark/**',
        'packages/cli/src/templates.ts',
      ],
      thresholds: {
        // Soft floors — raise over time
        lines: 50,
        functions: 50,
        branches: 40,
      },
    },
  },
});
