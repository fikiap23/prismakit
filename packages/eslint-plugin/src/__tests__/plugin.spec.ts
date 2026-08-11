import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import plugin from '../index';
import { requireCachedRepoProvider } from '../rules/require-cached-repo-provider';

const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/require-cached-repo-provider',
);

const lintConfig = [
  {
    files: ['**/*.ts'],
    plugins: {
      prismakit: {
        rules: { 'require-cached-repo-provider': requireCachedRepoProvider },
      },
    },
    rules: { 'prismakit/require-cached-repo-provider': 'error' as const },
    languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const },
  },
];

function lintFixture(relativeFile: string) {
  const filename = path.join(fixtureRoot, relativeFile);
  const linter = new Linter({ cwd: fixtureRoot });
  return linter.verify(fs.readFileSync(filename, 'utf8'), lintConfig, {
    filename,
  });
}

describe('@prismakit/eslint-plugin', () => {
  it('exports recommended config and rules', () => {
    expect(plugin.meta?.name).toBe('prismakit');
    expect(plugin.rules?.['no-prisma-service-outside-repos']).toBeDefined();
    expect(plugin.rules?.['no-direct-prisma-delegate']).toBeDefined();
    expect(plugin.rules?.['require-transaction-service']).toBeDefined();
    expect(plugin.rules?.['require-cached-repo-provider']).toBeDefined();
    expect(plugin.configs?.recommended).toBeDefined();
  });
});

describe('require-cached-repo-provider', () => {
  it('allows a cached repo listed in module providers', () => {
    expect(lintFixture('ok/repositories/profile.repository.ts')).toEqual([]);
  });

  it('allows an uncached compose-only repo outside providers', () => {
    expect(
      lintFixture('uncached/repositories/image.repository.ts'),
    ).toEqual([]);
  });

  it('reports a cached repo missing from module providers', () => {
    const messages = lintFixture('missing/repositories/profile.repository.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('ProfileRepository');
    expect(messages[0]?.message).toContain('providers');
  });
});
