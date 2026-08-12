import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { splitSelect } from '../utils/split-select';
import { buildLockClause } from '../lock/row-lock';
import { applyJitter } from '../cache/ttl-jitter.util';
import { stableHash } from '../cache/stable-hash.util';
import { selectIncludesSensitiveField } from '../cache/cache-guard.util';
import { paginator } from '../pagination/paginator';
import {
  setRegisteredCacheModels,
  validateCacheConfig,
} from '../cache/validate-cache-config';
import { createRepository } from '../create-repository';
import { clearPrismaMeta } from '../schema/prisma-meta';

describe('splitSelect', () => {
  it('splits scalars and relations and keeps FK', () => {
    const { dbSelect, relations } = splitSelect(
      {
        id: true,
        name: true,
        category: { select: { id: true, name: true } },
      },
      { id: 'id', name: 'name', categoryId: 'categoryId' },
    );
    expect(dbSelect).toEqual({ id: true, name: true, categoryId: true });
    expect(relations).toHaveProperty('category');
  });

  it('uses explicit relation local FKs when provided', () => {
    const { dbSelect } = splitSelect(
      { id: true, author: { select: { id: true } } },
      { id: 'id', authorUserId: 'authorUserId' },
      { author: ['authorUserId'] },
    );
    expect(dbSelect).toEqual({ id: true, authorUserId: true });
  });

  it('passes _count through to dbSelect (not treated as relation)', () => {
    const countSelect = {
      _count: { select: { repairJobs: true, vendorInvoices: true } },
    };
    const { dbSelect, relations } = splitSelect(countSelect, {
      id: 'id',
      code: 'code',
    });
    expect(dbSelect).toEqual(countSelect);
    expect(relations).toEqual({});
  });
});

describe('buildLockClause', () => {
  it('defaults to FOR NO KEY UPDATE', () => {
    expect(buildLockClause({})).toBe('FOR NO KEY UPDATE');
  });
  it('rejects nowait + skipLocked', () => {
    expect(() => buildLockClause({ nowait: true, skipLocked: true })).toThrow();
  });
});

describe('cache utils', () => {
  it('stableHash is deterministic', () => {
    expect(stableHash({ b: 1, a: 2 })).toBe(stableHash({ a: 2, b: 1 }));
  });
  it('applyJitter stays near ttl', () => {
    const j = applyJitter(100, 10);
    expect(j).toBeGreaterThanOrEqual(90);
    expect(j).toBeLessThanOrEqual(110);
  });
  it('blocks sensitive selects', () => {
    expect(selectIncludesSensitiveField({ password: true }, ['password'])).toBe(
      true,
    );
    expect(selectIncludesSensitiveField({ id: true }, ['password'])).toBe(
      false,
    );
  });
});

describe('validateCacheConfig', () => {
  it('skips when registry empty', () => {
    setRegisteredCacheModels([]);
    expect(() => validateCacheConfig('user')).not.toThrow();
  });
  it('throws for unregistered model', () => {
    setRegisteredCacheModels(['user']);
    expect(() => validateCacheConfig('vendor')).toThrow(/not registered/);
    setRegisteredCacheModels([]);
  });
});

describe('paginator', () => {
  it('paginates with meta', async () => {
    const paginate = paginator({});
    const model = {
      count: async () => 50,
      findMany: async () => [{ id: '1' }, { id: '2' }],
    };
    const result = await paginate(model, { where: {} }, { page: 2, perPage: 25 });
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 25,
      totalItems: 50,
      totalPages: 2,
    });
    expect(result.data).toHaveLength(2);
  });
});

describe('createRepository defaults', () => {
  it('resolves delegate from model key', async () => {
    const findUnique = async () => ({ id: '1', name: 'Ada' });
    const prisma = {
      user: { findUnique },
    };
    const Repo = createRepository({ model: 'user' });
    const repo = new Repo({ prisma });
    const result = await repo.getById({ id: '1', select: { id: true } });
    expect(result).toEqual({ id: '1', name: 'Ada' });
  });

  it('throws when model delegate is missing', async () => {
    const Repo = createRepository({ model: 'missing' });
    const repo = new Repo({ prisma: {} });
    await expect(repo.getById({ id: '1' })).rejects.toThrow(/no delegate/);
  });

  it('accepts cache: true shorthand', async () => {
    setRegisteredCacheModels([]);
    const Repo = createRepository({ model: 'user', cache: true });
    const repo = new Repo({
      prisma: {
        user: {
          findUnique: async () => ({ id: '1' }),
        },
      },
    });
    const result = await repo.getById({ id: '1' });
    expect(result).toEqual({ id: '1' });
  });

  it('allows omitting tags on mutations', async () => {
    const create = async () => ({ id: '1' });
    const Repo = createRepository({ model: 'user' });
    const repo = new Repo({
      prisma: { user: { create } },
    });
    const result = await repo.create({ data: { name: 'x' } as never });
    expect(result).toEqual({ id: '1' });
  });

  it('resolves lock from table name string', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismakit-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
model User {
  id   String @id @map("id")
  name String @map("name")

  @@map("users")
}
`,
      'utf-8',
    );

    expect(() =>
      createRepository({
        model: 'user',
        lock: 'users',
        schemaPath,
      }),
    ).not.toThrow();

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves composite @@id from schema without primaryKey option', async () => {
    clearPrismaMeta();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismakit-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
model ProductTag {
  productId String
  tagId     String
  @@id([productId, tagId])
}
`,
      'utf-8',
    );
    let where: Record<string, unknown> | undefined;
    const findUnique = async (args: { where: Record<string, unknown> }) => {
      where = args.where;
      return { productId: 'p1', tagId: 't1' };
    };

    const Repo = createRepository({
      model: 'productTag',
      schemaPath,
    });
    const repo = new Repo({
      prisma: { productTag: { findUnique } },
    });
    await repo.getById({
      id: { productId: 'p1', tagId: 't1' },
      select: { productId: true, tagId: true },
    });
    expect(where).toEqual({
      productId_tagId: { productId: 'p1', tagId: 't1' },
    });

    clearPrismaMeta();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
