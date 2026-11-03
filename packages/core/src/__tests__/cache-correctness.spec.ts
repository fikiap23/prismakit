import { describe, it, expect, afterEach } from 'vitest';
import { createRepository } from '../create-repository';
import { loadPrismaMetaFromDmmf } from '../schema/prisma-meta';
import { AutoComposer } from '../auto-composer';
import { RepositoryRegistry } from '../repository-registry';
import { stableHash } from '../cache/stable-hash.util';
import {
  resetGlobals,
  simpleDmmf,
  TestMemoryCache,
  createFakePrisma,
} from './helpers/setup';

const SELECT = { id: true, name: true } as const;

function fakeClient(names: string[]) {
  return createFakePrisma({
    models: {
      user: {
        rows: names.map((name, i) => ({ id: `u${i + 1}`, name, password: 'x' })),
      },
      post: { rows: [] },
      postTag: { rows: [], primaryKey: ['postId', 'tagId'] },
    },
  });
}

function setup(prisma = fakeClient(['Ada', 'Bob'])) {
  resetGlobals();
  loadPrismaMetaFromDmmf(simpleDmmf);
  const registry = new RepositoryRegistry();
  const autoCompose = new AutoComposer(registry);
  const cache = new TestMemoryCache('correct');
  const UserRepo = createRepository({
    model: 'user',
    cache: {
      ttl: 300,
      defaultSetCache: false,
      sensitiveFields: ['password'],
      writeGateTtlSeconds: false,
    },
  });
  const users = new UserRepo({ prisma, registry, autoCompose, cache });
  return { prisma, cache, users };
}

describe('cache correctness', () => {
  afterEach(() => resetGlobals());

  it('does not share an in-flight DB read between a transaction and the root client', async () => {
    const { users } = setup(fakeClient(['Ada']));
    const tx = fakeClient(['Ada', 'Ada-in-tx']);

    const [outside, inside] = await Promise.all([
      users.getMany({ where: { name: undefined }, select: SELECT }),
      users.getMany({ where: { name: undefined }, select: SELECT, tx }),
    ]);

    expect(outside).toHaveLength(1);
    expect(inside).toHaveLength(2);
  });

  it('count({ select }) returns the per-field object on miss and on hit', async () => {
    const { prisma, users } = setup();
    const delegate = prisma.user as { count: (args: any) => Promise<unknown> };
    const original = delegate.count.bind(delegate);
    delegate.count = async (args: any) =>
      args?.select ? { _all: 2, name: 2 } : original(args);

    const miss = await users.count({
      select: { _all: true, name: true },
      setCache: true,
    });
    const hit = await users.count({
      select: { _all: true, name: true },
      setCache: true,
    });

    expect(miss).toEqual({ _all: 2, name: 2 });
    expect(hit).toEqual({ _all: 2, name: 2 });
    expect(await users.count({})).toBe(2);
  });

  it('releases the stampede lock when a cached getMany fails at the DB', async () => {
    const { prisma, cache, users } = setup();
    const delegate = prisma.user as { findMany: (args: any) => Promise<unknown> };
    const original = delegate.findMany.bind(delegate);
    delegate.findMany = async () => {
      throw new Error('db down');
    };

    await expect(
      users.getMany({ select: SELECT, setCache: true }),
    ).rejects.toThrow('db down');
    expect(cache.keys().some((k) => k.endsWith(':lock'))).toBe(false);

    delegate.findMany = original;
    await expect(
      users.getMany({ select: SELECT, setCache: true }),
    ).resolves.toHaveLength(2);
  });

  it('clears the model cache after a write that ran while the cache was not ready', async () => {
    const { prisma, cache, users } = setup();

    const first = await users.getById({ id: 'u1', select: SELECT, setCache: true });
    expect(first?.name).toBe('Ada');

    cache.setReady(false);
    await users.updateById({ id: 'u1', data: { name: 'Ada2' }, select: SELECT });
    expect(prisma.__getRows('user')[0].name).toBe('Ada2');
    cache.setReady(true);

    const after = await users.getById({ id: 'u1', select: SELECT, setCache: true });
    expect(after?.name).toBe('Ada2');
  });

  it('stableHash reflects mutations of a reused (non-frozen) object', () => {
    const select: Record<string, boolean> = { id: true };
    const before = stableHash(select);
    select.name = true;
    expect(stableHash(select)).not.toBe(before);

    const frozen = Object.freeze({ id: true });
    expect(stableHash(frozen)).toBe(stableHash({ id: true }));
  });
});

describe('applyJitter', () => {
  it('never exceeds the jitter percent, even for short TTLs', async () => {
    const { applyJitter } = await import('../cache/ttl-jitter.util');
    for (let i = 0; i < 200; i++) {
      expect(applyJitter(2)).toBe(2);
      const long = applyJitter(300);
      expect(long).toBeGreaterThanOrEqual(270);
      expect(long).toBeLessThanOrEqual(330);
    }
  });
});
