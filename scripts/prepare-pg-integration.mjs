#!/usr/bin/env node
/**
 * Generate + push the Postgres integration fixture when DATABASE_URL is set.
 * No-op locally when the URL is missing (unit tests still run).
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.FORCE_INTEGRATION === '1' || process.env.CI === 'true') {
    console.error(
      '[prepare-pg-integration] DATABASE_URL required when CI=true or FORCE_INTEGRATION=1',
    );
    process.exit(1);
  }
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = join(root, 'packages/core/prisma-integration/schema.prisma');

execSync(`pnpm exec prisma generate --schema "${schema}"`, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
execSync(`pnpm exec prisma db push --schema "${schema}" --skip-generate --accept-data-loss`, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
