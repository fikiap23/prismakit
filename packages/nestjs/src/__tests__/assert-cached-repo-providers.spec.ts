import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCachedRepoProviders,
  assertDuplicateRepoProviders,
  assertUniqueRepoInstances,
  findCachedRepoDeclarations,
} from '../assert-cached-repo-providers';

let tmp: string | undefined;

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function writeRepo(rel: string, source: string): string {
  return writeTree({ [rel]: source });
}

function writeTree(files: Record<string, string>): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-strict-'));
  for (const [rel, source] of Object.entries(files)) {
    const file = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return tmp;
}

describe('findCachedRepoDeclarations', () => {
  it('finds class extends defineAppRepo with cache', () => {
    const root = writeRepo(
      'src/modules/user/repositories/profile.repository.ts',
      `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
    );
    expect(findCachedRepoDeclarations(root)).toEqual([
      {
        className: 'ProfileRepository',
        model: 'profile',
        file: 'src/modules/user/repositories/profile.repository.ts',
      },
    ]);
  });

  it('ignores compose-only repos without cache', () => {
    const root = writeRepo(
      'src/modules/product/repositories/image.repository.ts',
      `export class ProductImageRepository extends defineAppRepo({
  model: 'productImage',
}) {}
`,
    );
    expect(findCachedRepoDeclarations(root)).toEqual([]);
  });
});

describe('assertCachedRepoProviders', () => {
  it('throws when a cached class is not a live Nest provider', () => {
    const root = writeRepo(
      'src/modules/user/repositories/profile.repository.ts',
      `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
    );
    expect(() =>
      assertCachedRepoProviders({
        projectRoot: root,
        cachedModels: new Set(),
        classNames: new Set(),
      }),
    ).toThrow(/ProfileRepository/);
  });

  it('passes when the cached model is a live provider', () => {
    const root = writeRepo(
      'src/modules/user/repositories/profile.repository.ts',
      `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
    );
    expect(() =>
      assertCachedRepoProviders({
        projectRoot: root,
        cachedModels: new Set(['profile']),
        classNames: new Set(),
      }),
    ).not.toThrow();
  });

  it('passes when the class name is registered even if model meta is missing', () => {
    const root = writeRepo(
      'src/modules/user/repositories/profile.repository.ts',
      `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
    );
    expect(() =>
      assertCachedRepoProviders({
        projectRoot: root,
        cachedModels: new Set(),
        classNames: new Set(['ProfileRepository']),
      }),
    ).not.toThrow();
  });
});

describe('assertUniqueRepoInstances', () => {
  it('throws when the same model has two Nest instances', () => {
    expect(() =>
      assertUniqueRepoInstances(
        new Map([['profile', new Set([{}, {}])]]),
      ),
    ).toThrow(/2 instances/);
  });

  it('passes when each model has one instance', () => {
    expect(() =>
      assertUniqueRepoInstances(new Map([['profile', new Set([{}])]])),
    ).not.toThrow();
  });
});

describe('assertDuplicateRepoProviders', () => {
  it('throws when the same repo class is in two module providers arrays', () => {
    const root = writeTree({
      'src/modules/user/repositories/profile.repository.ts': `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
      'src/modules/user/user.module.ts': `export const UserModule = { providers: [ProfileRepository] };`,
      'src/modules/auth/auth.module.ts': `export const AuthModule = { providers: [ProfileRepository] };`,
    });
    expect(() =>
      assertDuplicateRepoProviders({ projectRoot: root }),
    ).toThrow(/ProfileRepository/);
  });

  it('passes when the repo is in only one module providers array', () => {
    const root = writeTree({
      'src/modules/user/repositories/profile.repository.ts': `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
      'src/modules/user/user.module.ts': `export const UserModule = { providers: [ProfileRepository] };`,
      'src/modules/auth/auth.module.ts': `export const AuthModule = { providers: [AuthService] };`,
    });
    expect(() =>
      assertDuplicateRepoProviders({ projectRoot: root }),
    ).not.toThrow();
  });

  it('does not treat compiled output as a second module', () => {
    const source = `export const UserModule = { providers: [ProfileRepository] };`;
    const repo = `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`;
    const root = writeTree({
      'src/modules/user/repositories/profile.repository.ts': repo,
      'src/modules/user/user.module.ts': source,
      'build/compile/src/modules/user/repositories/profile.repository.js': repo,
      'build/compile/src/modules/user/user.module.js': source,
    });
    expect(() =>
      assertDuplicateRepoProviders({ projectRoot: root }),
    ).not.toThrow();
  });

  it('still detects duplicates when only compiled modules exist', () => {
    const root = writeTree({
      'build/compile/src/modules/user/repositories/profile.repository.js': `export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
`,
      'build/compile/src/modules/user/user.module.js': `export const UserModule = { providers: [ProfileRepository] };`,
      'build/compile/src/modules/auth/auth.module.js': `export const AuthModule = { providers: [ProfileRepository] };`,
    });
    expect(() =>
      assertDuplicateRepoProviders({ projectRoot: root }),
    ).toThrow(/ProfileRepository/);
  });
});
