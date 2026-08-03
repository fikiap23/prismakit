import { describe, it, expect, afterEach } from 'vitest';
import { setComposeOptions } from '../compose/compose-options';
import { resetGlobals, setupSimpleWorld } from './helpers/setup';

describe('compose + cache + tx', () => {
  afterEach(() => resetGlobals());

  it('relation getMany respects setCache from compose options', async () => {
    const { repos, cache, prisma } = setupSimpleWorld({
      models: {
        user: {
          rows: [{ id: 'u1', name: 'Ada', password: 'x' }],
        },
        post: {
          rows: [{ id: 'p1', title: 'Hello', authorId: 'u1' }],
        },
      },
    });

    setComposeOptions({ setCache: false });

    await repos.post.getById({
      id: 'p1',
      select: {
        id: true,
        title: true,
        author: { select: { id: true, name: true } },
      },
      setCache: false,
    });

    // No query/entity cache keys for user should have been written by compose
    const userKeys = cache.keys().filter((k) => k.includes(':user:'));
    expect(userKeys).toEqual([]);

    prisma.__resetCalls();
    await repos.post.getById({
      id: 'p1',
      select: {
        id: true,
        author: { select: { id: true, name: true } },
      },
      setCache: false,
    });

    // Second call must still hit DB for author (no relation cache)
    const userFinds = prisma.__calls.filter(
      (c) => c.model === 'user' && c.method === 'findMany',
    );
    expect(userFinds.length).toBeGreaterThan(0);
  });

  it('parent setCache:false propagates to compose (default compose setCache must not win)', async () => {
    const { repos, cache } = setupSimpleWorld({
      models: {
        user: { rows: [{ id: 'u1', name: 'Ada', password: 'x' }] },
        post: { rows: [{ id: 'p1', title: 'Hello', authorId: 'u1' }] },
      },
    });

    // Leave global compose setCache at default true — parent false must override
    await repos.post.getById({
      id: 'p1',
      select: {
        id: true,
        author: { select: { id: true, name: true } },
      },
      setCache: false,
    });

    const userKeys = cache.keys().filter((k) => k.includes(':user:'));
    expect(userKeys).toEqual([]);
  });

  it('compose inside a transaction uses tx client and bypasses cache', async () => {
    const { repos, cache, prisma } = setupSimpleWorld({
      models: {
        user: { rows: [{ id: 'u1', name: 'Ada', password: 'x' }] },
        post: { rows: [] },
      },
    });

    await prisma.$transaction(async (tx) => {
      await repos.post.create({
        tx: tx as any,
        data: { id: 'p1', title: 'InTx', authorId: 'u1' },
        select: {
          id: true,
          title: true,
          author: { select: { id: true, name: true } },
        },
      });
    });

    // Relation fetch during create+compose inside tx must not write cache
    const keys = cache.keys().filter((k) => !k.startsWith('__setmeta:'));
    expect(keys).toEqual([]);
  });

  it('updating related model invalidates its own cache so compose refreshes', async () => {
    const { repos } = setupSimpleWorld({
      models: {
        user: { rows: [{ id: 'u1', name: 'Ada', password: 'x' }] },
        post: { rows: [{ id: 'p1', title: 'Hello', authorId: 'u1' }] },
      },
    });

    setComposeOptions({ setCache: true });

    const first = await repos.post.getById({
      id: 'p1',
      select: {
        id: true,
        author: { select: { id: true, name: true } },
      },
      setCache: true,
    });
    expect(first.author.name).toBe('Ada');

    await repos.user.updateById({
      id: 'u1',
      data: { name: 'Ada Lovelace' },
      select: { id: true, name: true },
    });

    const second = await repos.post.getById({
      id: 'p1',
      select: {
        id: true,
        author: { select: { id: true, name: true } },
      },
      setCache: true,
    });
    expect(second.author.name).toBe('Ada Lovelace');
  });
});
