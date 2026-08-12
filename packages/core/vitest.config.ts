import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration suites share one Postgres DB; avoid cross-file truncate races.
    fileParallelism: false,
  },
});
