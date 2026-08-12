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
import { markPrismakitRepo } from '../inherit-repo-inject';

afterEach(() => {
  clearPrismaMeta();
});

describe('PrismaKitModule DI', () => {
  it('forRootAsync returns a DynamicModule with module PrismaKitModule', () => {
    const dynamic = PrismaKitModule.forRootAsync({
      useFactory: async () => ({ prisma: {} }),
    });
    expect(dynamic.module).toBe(PrismaKitModule);
    expect(dynamic.global).toBe(true);
    expect(dynamic.providers?.length).toBeGreaterThan(0);
  });

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

describe('PrismaKitModule strictCachedRepos', () => {
  it('throws onApplicationBootstrap when a cached repo file has no provider', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-boot-'));
    const repoDir = path.join(dir, 'src/modules/user/repositories');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'profile.repository.ts'),
      `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const module = new PrismaKitModule(
        { prisma: {}, strictCachedRepos: true },
        new RepositoryRegistry(),
        new ModulesContainer(),
      );
      expect(() => module.onApplicationBootstrap()).toThrow(/ProfileRepository/);
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws onApplicationBootstrap when source lists the repo in two modules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-boot-dup-src-'));
    fs.mkdirSync(path.join(dir, 'src/modules/user/repositories'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(dir, 'src/modules/auth'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src/modules/user/repositories/profile.repository.ts'),
      `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
    );
    fs.writeFileSync(
      path.join(dir, 'src/modules/user/user.module.ts'),
      `export const UserModule = { providers: [ProfileRepository] };`,
    );
    fs.writeFileSync(
      path.join(dir, 'src/modules/auth/auth.module.ts'),
      `export const AuthModule = { providers: [ProfileRepository] };`,
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const module = new PrismaKitModule(
        { prisma: {}, strictCachedRepos: true },
        new RepositoryRegistry(),
      );
      expect(() => module.onApplicationBootstrap()).toThrow(
        /more than one Nest module/,
      );
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not throw when strictCachedRepos is false', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-boot-off-'));
    const repoDir = path.join(dir, 'src/modules/user/repositories');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'profile.repository.ts'),
      `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const module = new PrismaKitModule(
        { prisma: {}, strictCachedRepos: false },
        new RepositoryRegistry(),
        new ModulesContainer(),
      );
      expect(() => module.onApplicationBootstrap()).not.toThrow();
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when the cached class is a Nest provider', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-boot-ok-'));
    const repoDir = path.join(dir, 'src/modules/user/repositories');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'profile.repository.ts'),
      `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
    );

    class ProfileRepository {}
    markPrismakitRepo(ProfileRepository, {
      model: 'profile',
      hasCache: true,
    });
    const container = new ModulesContainer();
    container.set('UserModule', {
      providers: new Map([
        [
          'ProfileRepository',
          { metatype: ProfileRepository, instance: {} },
        ],
      ]),
    } as never);

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const module = new PrismaKitModule(
        { prisma: {}, strictCachedRepos: true },
        new RepositoryRegistry(),
        container,
      );
      expect(() => module.onApplicationBootstrap()).not.toThrow();
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when the same cached repo is constructed in two modules', () => {
    class ProfileRepository {}
    markPrismakitRepo(ProfileRepository, {
      model: 'profile',
      hasCache: true,
    });
    const container = new ModulesContainer();
    container.set('UserModule', {
      providers: new Map([
        ['ProfileRepository', { metatype: ProfileRepository, instance: {} }],
      ]),
    } as never);
    container.set('AuthModule', {
      providers: new Map([
        ['ProfileRepository', { metatype: ProfileRepository, instance: {} }],
      ]),
    } as never);

    const module = new PrismaKitModule(
      {
        prisma: {},
        strictCachedRepos: true,
        modulesRoot: path.join(os.tmpdir(), 'pk-empty-dup'),
      },
      new RepositoryRegistry(),
      container,
    );
    expect(() => module.onApplicationBootstrap()).toThrow(/2 instances/);
  });
});
