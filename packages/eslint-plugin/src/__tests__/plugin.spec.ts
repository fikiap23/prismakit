import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import type { Rule } from 'eslint';
import plugin from '../index';
import { requireCachedRepoProvider } from '../rules/require-cached-repo-provider';
import { noPrismaServiceOutsideRepos } from '../rules/no-prisma-service-outside-repos';
import { noDirectPrismaDelegate } from '../rules/no-direct-prisma-delegate';
import { requireTransactionService } from '../rules/require-transaction-service';

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
  const caseRoot = path.join(fixtureRoot, relativeFile.split(/[/\\]/)[0]);
  const linter = new Linter({ cwd: caseRoot });
  return linter.verify(fs.readFileSync(filename, 'utf8'), lintConfig, {
    filename,
  });
}

function lintWithRule(
  ruleId: string,
  rule: Rule.RuleModule,
  relativeFile: string,
) {
  const fixtureRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    ruleId,
  );
  const filename = path.join(fixtureRoot, relativeFile);
  const caseRoot = path.join(fixtureRoot, relativeFile.split(/[/\\]/)[0]);
  const linter = new Linter({ cwd: caseRoot });
  return linter.verify(
    fs.readFileSync(filename, 'utf8'),
    [
      {
        files: ['**/*.ts'],
        plugins: { prismakit: { rules: { [ruleId]: rule } } },
        rules: { [`prismakit/${ruleId}`]: 'error' as const },
        languageOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
        },
      },
    ],
    { filename },
  );
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

describe('no-prisma-service-outside-repos', () => {
  it('reports PrismaService usage in a service file', () => {
    const messages = lintWithRule(
      'no-prisma-service-outside-repos',
      noPrismaServiceOutsideRepos,
      'bad/user.service.ts',
    );
    expect(messages.some((m) => m.messageId === 'forbidden')).toBe(true);
  });
});

describe('no-direct-prisma-delegate', () => {
  it('reports this.prisma.user.findMany in a service file', () => {
    const messages = lintWithRule(
      'no-direct-prisma-delegate',
      noDirectPrismaDelegate,
      'bad/user.service.ts',
    );
    expect(messages.some((m) => m.messageId === 'forbidden')).toBe(true);
  });

  it('reports prisma.user.createManyAndReturn outside repositories', () => {
    const messages = lintWithRule(
      'no-direct-prisma-delegate',
      noDirectPrismaDelegate,
      'bad/seed.ts',
    );
    expect(messages.some((m) => m.messageId === 'forbidden')).toBe(true);
  });
});

describe('require-transaction-service', () => {
  it('reports $transaction outside infrastructure', () => {
    const messages = lintWithRule(
      'require-transaction-service',
      requireTransactionService,
      'bad/order.service.ts',
    );
    expect(messages.some((m) => m.messageId === 'forbidden')).toBe(true);
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

  it('reports the feature module providers array when a sibling cached repo is missing', () => {
    const messages = lintFixture('missing/user.module.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('ProfileRepository');
    expect(messages[0]?.messageId).toBe('missingInModule');
  });

  it('does not report a module whose sibling cached repo is in providers', () => {
    expect(lintFixture('ok/user.module.ts')).toEqual([]);
  });

  it('does not report a module whose sibling repos have no cache', () => {
    expect(lintFixture('uncached/user.module.ts')).toEqual([]);
  });

  it('allows a cached repo listed in a different feature module', () => {
    expect(
      lintFixture('cross-module/user/repositories/profile.repository.ts'),
    ).toEqual([]);
    expect(lintFixture('cross-module/user/user.module.ts')).toEqual([]);
  });

  it('reports a repo listed in two module providers arrays', () => {
    const auth = lintFixture('duplicate/auth/auth.module.ts');
    expect(auth.some((m) => m.messageId === 'duplicate')).toBe(true);
    expect(auth[0]?.message).toContain('ProfileRepository');
    const user = lintFixture('duplicate/user/user.module.ts');
    expect(user.some((m) => m.messageId === 'duplicate')).toBe(true);
  });
});
