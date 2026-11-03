import { describe, it, expect, afterEach } from 'vitest';
import { createRepository } from '../create-repository';
import { loadPrismaMetaFromDmmf } from '../schema/prisma-meta';
import { AutoComposer } from '../auto-composer';
import { RepositoryRegistry } from '../repository-registry';
import {
  resetGlobals,
  simpleDmmf,
  TestMemoryCache,
  createFakePrisma,
} from './helpers/setup';

const SELECT = { id: true, name: true } as const;

function setupTenantWorld(cacheOverrides: Record<string, unknown> = {}) {
  resetGlobals();
  loadPrismaMetaFromDmmf(simpleDmmf);
  const prisma = createFakePrisma({
    models: {
      user: {
        rows: [
          { id: 'a1', name: 'tenant-a', password: 'x' },
          { id: 'b1', name: 'tenant-b', password: 'y' },
        ],
      },
      post: { rows: [] },
      postTag: { rows: [], primaryKey: ['postId', 'tagId'] },
    },
  });
  const registry = new RepositoryRegistry();
  const autoCompose = new AutoComposer(registry);
  const cache = new TestMemoryCache('tenant');
  const UserRepo = createRepository({
    model: 'user',
    cache: {
      ttl: 300,
      defaultSetCache: false,
      sensitiveFields: ['password'],
      tagScopedInvalidation: true,
      ...cacheOverrides,
    },
  });
  const users = new UserRepo({ prisma, registry, autoCompose, cache });

  const queryValueKeys = () =>
    cache
      .keys()
      .filter(
        (k) =>
          k.includes(':q:getMany:') &&
          !k.includes('__idx'),
      );

  /** Caches one getMany per tenant and returns its value key. */
  async function cacheTenantList(tenant: 'a' | 'b'): Promise<string> {
    const before = new Set(queryValueKeys());
    await users.getMany({
      where: { name: `tenant-${tenant}` },
      select: SELECT,
      setCache: true,
      cacheTags: [`cafe:${tenant}`],
    });
    const added = queryValueKeys().filter((k) => !before.has(k));
    expect(added).toHaveLength(1);
    return added[0];
  }

  async function cacheUntaggedList(): Promise<string> {
    const before = new Set(queryValueKeys());
    await users.getMany({ select: SELECT, setCache: true });
    const added = queryValueKeys().filter((k) => !before.has(k));
    expect(added).toHaveLength(1);
    return added[0];
  }

  const has = (key: string) => cache.keys().includes(key);

  return { prisma, cache, users, cacheTenantList, cacheUntaggedList, has };
}

describe('tagScopedInvalidation', () => {
  afterEach(() => resetGlobals());

  it('tagged mutation clears its tag and untagged queries, keeps other tenants', async () => {
    const w = setupTenantWorld({ writeGateTtlSeconds: false });
    const keyA = await w.cacheTenantList('a');
    const keyB = await w.cacheTenantList('b');
    const keyAll = await w.cacheUntaggedList();

    await w.users.create({
      data: { id: 'a2', name: 'tenant-a', password: 'z' },
      select: { id: true },
      tags: ['cafe:a'],
    });

    expect(w.has(keyA)).toBe(false);
    expect(w.has(keyAll)).toBe(false);
    expect(w.has(keyB)).toBe(true);
  });

  it('invalidateCache({ tags }) is scoped the same way', async () => {
    const w = setupTenantWorld({ writeGateTtlSeconds: false });
    const keyA = await w.cacheTenantList('a');
    const keyB = await w.cacheTenantList('b');
    const keyAll = await w.cacheUntaggedList();

    await w.users.invalidateCache({ tags: ['cafe:a'] });

    expect(w.has(keyA)).toBe(false);
    expect(w.has(keyAll)).toBe(false);
    expect(w.has(keyB)).toBe(true);
  });

  it('mutation without tags still clears every query of the model', async () => {
    const w = setupTenantWorld({ writeGateTtlSeconds: false });
    const keyA = await w.cacheTenantList('a');
    const keyB = await w.cacheTenantList('b');

    await w.users.create({
      data: { id: 'c1', name: 'tenant-c', password: 'z' },
      select: { id: true },
    });

    expect(w.has(keyA)).toBe(false);
    expect(w.has(keyB)).toBe(false);
  });

  it('write gate blocks only the invalidated tag and untagged queries', async () => {
    const w = setupTenantWorld({ writeGateTtlSeconds: 30 });

    await w.users.invalidateCache({ tags: ['cafe:a'] });
    // Only the tag + untagged gates are armed, not all queries
    expect(w.cache.keys().some((k) => k.endsWith(':user:g:q'))).toBe(false);
    expect(w.cache.keys().some((k) => k.endsWith(':user:g:t:cafe:a'))).toBe(true);

    // Tenant B is unaffected → SET goes through
    await w.cacheTenantList('b');

    const countQueries = () =>
      w.cache
        .keys()
        .filter(
          (k) =>
            k.includes(':q:getMany:') &&
            !k.includes('__idx'),
        ).length;
    const afterB = countQueries();

    // Tenant A and untagged queries are gated → not cached yet
    await w.users.getMany({
      where: { name: 'tenant-a' },
      select: SELECT,
      setCache: true,
      cacheTags: ['cafe:a'],
    });
    await w.users.getMany({ select: SELECT, setCache: true });
    expect(countQueries()).toBe(afterB);
  });

  it('entity invalidation gates only that entity', async () => {
    const w = setupTenantWorld({ writeGateTtlSeconds: 30 });

    await w.users.invalidateCache({ id: 'a1', tags: ['cafe:a'] });

    await w.users.getById({ id: 'b1', select: SELECT, setCache: true });
    await w.users.getById({ id: 'a1', select: SELECT, setCache: true });

    const entityValueKeys = w.cache
      .keys()
      .filter(
        (k) =>
          k.includes(':e:') &&
          !k.includes('__idx') &&
          !k.startsWith('__setmeta:'),
      );
    expect(entityValueKeys.some((k) => k.includes(':e:b1:'))).toBe(true);
    expect(entityValueKeys.some((k) => k.includes(':e:a1:'))).toBe(false);
  });

  it('legacy mode (flag off) keeps clearing other tenants', async () => {
    const w = setupTenantWorld({
      tagScopedInvalidation: false,
      writeGateTtlSeconds: false,
    });
    const keyA = await w.cacheTenantList('a');
    const keyB = await w.cacheTenantList('b');

    await w.users.invalidateCache({ tags: ['cafe:a'] });

    expect(w.has(keyA)).toBe(false);
    expect(w.has(keyB)).toBe(false);
  });

  it('stale reads stay impossible: own tenant re-reads fresh data after a tagged write', async () => {
    const w = setupTenantWorld({ writeGateTtlSeconds: false });
    await w.cacheTenantList('a');

    await w.users.create({
      data: { id: 'a2', name: 'tenant-a', password: 'z' },
      select: { id: true },
      tags: ['cafe:a'],
    });

    const rows = await w.users.getMany({
      where: { name: 'tenant-a' },
      select: SELECT,
      setCache: true,
      cacheTags: ['cafe:a'],
    });
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(['a1', 'a2']);
  });
});
