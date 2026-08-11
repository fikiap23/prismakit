import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModulesContainer } from '@nestjs/core';
import {
  clearPrismaMeta,
  RepositoryRegistry,
} from '@prismakit/core';
import { PrismaKitModule } from '../prismakit.module';
import { PRISMAKIT_OPTIONS } from '../tokens';

afterEach(() => {
  clearPrismaMeta();
});

describe('PrismaKitModule DI', () => {
  it('declares @Inject tokens for options, registry, and ModulesContainer', () => {
    const selfDeps: Array<{ index: number; param: unknown }> =
      Reflect.getMetadata('self:paramtypes', PrismaKitModule) ?? [];
    const byIndex = new Map(selfDeps.map((d) => [d.index, d.param]));

    expect(byIndex.get(0)).toBe(PRISMAKIT_OPTIONS);
    expect(byIndex.get(1)).toBe(RepositoryRegistry);
    expect(byIndex.get(2)).toBe(ModulesContainer);
  });
});

describe('PrismaKitModule autoRegisterModels', () => {
  it('registers stub repos for models missing from the registry', () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      user: { findMany },
      profile: { findMany },
    };
    const registry = new RepositoryRegistry();
    const module = new PrismaKitModule(
      { prisma, autoRegisterModels: ['user', 'profile'] },
      registry,
    );

    module.onModuleInit();

    expect(registry.get('user')).toBeDefined();
    expect(registry.get('profile')).toBeDefined();
  });

  it('skips models that already have a repository', () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { profile: { findMany } };
    const registry = new RepositoryRegistry();
    const existing = { getMany: vi.fn() };
    registry.register('profile', { repository: existing });

    const module = new PrismaKitModule(
      { prisma, autoRegisterModels: ['profile'] },
      registry,
    );
    module.onModuleInit();

    expect(registry.get('profile')?.repository).toBe(existing);
  });

  it('skips models without a prisma delegate', () => {
    const prisma = { user: { findMany: vi.fn() } };
    const registry = new RepositoryRegistry();
    const module = new PrismaKitModule(
      { prisma, autoRegisterModels: ['user', 'profile'] },
      registry,
    );

    module.onModuleInit();

    expect(registry.get('user')).toBeDefined();
    expect(registry.get('profile')).toBeUndefined();
  });

  it('autoRegisterModels: true loads client keys from schemaPath', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-schema-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
model User {
  id      String   @id
  profile Profile?
}
model Profile {
  id     String @id
  userId String @unique
  user   User   @relation(fields: [userId], references: [id])
}
`,
    );

    try {
      const prisma = {
        user: { findMany: vi.fn() },
        profile: { findMany: vi.fn() },
      };
      const registry = new RepositoryRegistry();
      const module = new PrismaKitModule(
        { prisma, schemaPath, autoRegisterModels: true },
        registry,
      );

      module.onModuleInit();

      expect(registry.get('user')).toBeDefined();
      expect(registry.get('profile')).toBeDefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
