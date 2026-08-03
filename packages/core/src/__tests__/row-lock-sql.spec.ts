import { describe, it, expect, afterEach } from 'vitest';
import {
  queryRowForUpdate,
  queryRowsForUpdate,
  buildLockClause,
} from '../lock/row-lock';
import { buildLockConfigFromMeta } from '../lock/build-lock-config';
import {
  loadPrismaMetaFromDmmf,
  clearPrismaMeta,
} from '../schema/prisma-meta';
import { createRepository } from '../create-repository';
import { AutoComposer } from '../auto-composer';
import { RepositoryRegistry } from '../repository-registry';
import {
  resetGlobals,
  setupSimpleWorld,
  setupMessyWorld,
  simpleDmmf,
  createFakePrisma,
  TestMemoryCache,
} from './helpers/setup';

describe('row lock / raw SQL', () => {
  afterEach(() => resetGlobals());

  it('buildLockClause covers modes and modifiers', () => {
    expect(buildLockClause({ mode: 'update' })).toBe('FOR UPDATE');
    expect(buildLockClause({ mode: 'noKeyUpdate', nowait: true })).toBe(
      'FOR NO KEY UPDATE NOWAIT',
    );
    expect(buildLockClause({ mode: 'share', skipLocked: true })).toBe(
      'FOR SHARE SKIP LOCKED',
    );
    expect(() =>
      buildLockClause({ nowait: true, skipLocked: true }),
    ).toThrow(/mutually exclusive/);
  });

  it('generates quoted SQL with @@map / @map columns', async () => {
    clearPrismaMeta();
    loadPrismaMetaFromDmmf(simpleDmmf);
    const lock = buildLockConfigFromMeta('user')!;
    expect(lock.tableName).toBe('users');
    expect(lock.columns!.name).toBe('full_name');

    const raw: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
        raw.push({ sql, values });
        return [{ id: 'u1', full_name: 'Ada' }];
      },
    };

    const row = await queryRowForUpdate(tx, lock, {
      id: 'u1',
      select: { id: true, name: true },
      lock: { mode: 'noKeyUpdate' },
      idColumn: 'id',
    });

    expect(row).toEqual({ id: 'u1', name: 'Ada' });
    expect(raw[0].sql).toBe(
      'SELECT "id", "full_name" FROM "users" WHERE "id" = $1 FOR NO KEY UPDATE LIMIT $2',
    );
    expect(raw[0].values).toEqual(['u1', 1]);
  });

  it('uses messy schema mapped table/columns for lock SQL', async () => {
    const { repos } = setupMessyWorld({
      models: {
        user: {
          rows: [{ uid: 'u1', name: 'Ada' }],
          primaryKey: 'uid',
        },
      },
    });

    const raw: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
        raw.push({ sql, values });
        return [{ user_id: 'u1', full_name: 'Ada' }];
      },
    };

    await repos.user.getById({
      id: 'u1',
      select: { uid: true, name: true },
      tx: tx as any,
      lock: { mode: 'update' },
    });

    expect(raw[0].sql).toContain('FROM "m_user"');
    expect(raw[0].sql).toContain('"user_id"');
    expect(raw[0].sql).toContain('"full_name"');
    expect(raw[0].sql).toContain('FOR UPDATE');
  });

  it('getThrowById + skipLocked returns findUniqueOrThrow row (not null)', async () => {
    const { repos, prisma } = setupSimpleWorld({
      models: {
        user: { rows: [{ id: 'u1', name: 'Ada', password: 'x' }] },
      },
    });

    // First raw returns [] (skipped), findUniqueOrThrow still finds the row
    let rawCalls = 0;
    const tx = {
      $queryRawUnsafe: async () => {
        rawCalls += 1;
        return []; // skipLocked → no row
      },
      user: (prisma as any).user,
    };

    const result = await repos.user.getThrowById({
      id: 'u1',
      select: { id: true, name: true },
      tx: tx as any,
      lock: { mode: 'update', skipLocked: true },
    });

    // Fixed: must return the row from findUniqueOrThrow, not null
    expect(result).toEqual({ id: 'u1', name: 'Ada' });
    expect(rawCalls).toBe(1);
  });

  it('composite PK + string id throws on lock path (same as idWhere)', async () => {
    clearPrismaMeta();
    loadPrismaMetaFromDmmf(simpleDmmf);
    const lock = buildLockConfigFromMeta('postTag')!;
    const tx = {
      $queryRawUnsafe: async () => [],
    };

    await expect(
      queryRowForUpdate(tx, lock, {
        id: 'not-an-object',
        select: { postId: true, tagId: true },
        lock: { mode: 'update' },
        idColumn: ['postId', 'tagId'],
      }),
    ).rejects.toThrow(/composite|object/i);
  });

  it('composite PK object builds multi-column WHERE', async () => {
    clearPrismaMeta();
    loadPrismaMetaFromDmmf(simpleDmmf);
    const lock = buildLockConfigFromMeta('postTag')!;
    const raw: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
        raw.push({ sql, values });
        return [{ post_id: 'p1', tag_id: 't1', label: 'x' }];
      },
    };

    const rows = await queryRowsForUpdate(tx, lock, {
      where: { postId: 'p1', tagId: 't1' },
      select: { postId: true, tagId: true, label: true },
      lock: { mode: 'update' },
      take: 1,
    });

    expect(rows[0]).toMatchObject({ postId: 'p1', tagId: 't1', label: 'x' });
    expect(raw[0].sql).toContain('"post_id" = $1');
    expect(raw[0].sql).toContain('"tag_id" = $2');
  });

  it('orderBy is applied in lock SQL for getFirst/getMany', async () => {
    const { repos } = setupSimpleWorld({
      models: {
        user: {
          rows: [
            { id: 'u1', name: 'Ada', password: 'x' },
            { id: 'u2', name: 'Bob', password: 'y' },
          ],
        },
      },
    });

    const raw: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
        raw.push({ sql, values });
        return [{ id: 'u1', full_name: 'Ada' }];
      },
    };

    await repos.user.getMany({
      where: { password: 'x' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' } as any,
      take: 1,
      tx: tx as any,
      lock: { mode: 'update' },
    });

    // Fixed: ORDER BY must appear when orderBy is provided
    expect(raw[0].sql).toMatch(/ORDER BY/i);
  });

  it('short-circuits empty IN [] without invalid SQL', async () => {
    clearPrismaMeta();
    loadPrismaMetaFromDmmf(simpleDmmf);
    const lock = buildLockConfigFromMeta('user')!;
    const raw: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
        raw.push({ sql, values });
        return [];
      },
    };

    const rows = await queryRowsForUpdate(tx, lock, {
      where: { id: { in: [] } },
      select: { id: true },
      lock: { mode: 'update' },
    });

    expect(rows).toEqual([]);
    expect(raw).toHaveLength(0); // must not emit IN ()
  });

  it('locked read with relations does not serve cached relation rows', async () => {
    const { repos, cache } = setupSimpleWorld({
      models: {
        user: { rows: [{ id: 'u1', name: 'Ada', password: 'x' }] },
        post: { rows: [{ id: 'p1', title: 'Hello', authorId: 'u1' }] },
      },
    });

    // Prime relation cache
    await repos.user.getById({
      id: 'u1',
      select: { id: true, name: true },
      setCache: true,
    });
    await repos.user.updateById({
      id: 'u1',
      data: { name: 'StaleIfCached' },
      select: { id: true },
      invalidate: 'none',
    });
    // Manually leave entity cache pointing at old name by not invalidating —
    // but updateById with invalidate none leaves cache. Re-seed old cache:
    // Actually update with invalidate none leaves Ada in DB as StaleIfCached
    // and cache still has Ada if we primed before. Wait — we updated DB.
    // Cache still has {id, name: Ada}. Locked compose must bypass that.

    // Re-seed: put stale value in cache after DB update
    // Simpler approach: update DB via prisma directly without invalidation
    const prisma = createFakePrisma({
      models: {
        user: { rows: [{ id: 'u1', name: 'Fresh', password: 'x' }] },
        post: { rows: [{ id: 'p1', title: 'Hello', authorId: 'u1' }] },
      },
    });
    clearPrismaMeta();
    loadPrismaMetaFromDmmf(simpleDmmf);
    const registry = new RepositoryRegistry();
    const autoCompose = new AutoComposer(registry);
    const mem = new TestMemoryCache('lock-compose');
    const deps = { prisma, cache: mem, registry, autoCompose };
    const UserRepo = createRepository({
      model: 'user',
      primaryKey: 'id',
      scalarFields: { id: 'id', name: 'name', password: 'password' },
      cache: { ttl: 300 },
      lock: true,
    });
    const PostRepo = createRepository({
      model: 'post',
      primaryKey: 'id',
      scalarFields: { id: 'id', title: 'title', authorId: 'authorId' },
      cache: { ttl: 300 },
      lock: true,
    });
    const userRepo = new UserRepo(deps);
    const postRepo = new PostRepo(deps);

    // Cache stale author
    await userRepo.getById({
      id: 'u1',
      select: { id: true, name: true },
      setCache: true,
    });
    prisma.__setRows('user', [{ id: 'u1', name: 'FreshName', password: 'x' }]);
    // Do NOT invalidate — cache still has "Fresh" (old) wait we cached Fresh then changed to FreshName

    const tx = {
      $queryRawUnsafe: async () => [{ id: 'p1', title: 'Hello', author_id: 'u1' }],
      post: (prisma as any).post,
      user: (prisma as any).user,
    };

    const row = await postRepo.getById({
      id: 'p1',
      select: {
        id: true,
        title: true,
        author: { select: { id: true, name: true } },
      },
      tx: tx as any,
      lock: { mode: 'update' },
    });

    // Compose during tx/lock must bypass cache → FreshName from DB
    expect(row.author.name).toBe('FreshName');
  });
});
