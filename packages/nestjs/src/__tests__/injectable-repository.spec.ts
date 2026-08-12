import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { AutoComposer, RepositoryRegistry } from '@prismakit/core';
import { createInjectableRepository } from '../injectable-repository';
import { getPrismakitRepoMeta } from '../inherit-repo-inject';
import { PRISMAKIT_CACHE, PRISMAKIT_PRISMA } from '../tokens';

describe('createInjectableRepository DI', () => {
  it('stamps model and hasCache on the injectable class', () => {
    const Cached = createInjectableRepository({
      model: 'profile',
      cache: { ttl: 60 },
    });
    expect(getPrismakitRepoMeta(Cached)).toEqual({
      model: 'profile',
      hasCache: true,
    });

    const Uncached = createInjectableRepository({ model: 'productImage' });
    expect(getPrismakitRepoMeta(Uncached)).toEqual({
      model: 'productImage',
      hasCache: false,
    });
  });

  it('declares @Inject tokens for prisma, cache, registry, and AutoComposer', () => {
    const Repo = createInjectableRepository({ model: 'user' });
    const selfDeps: Array<{ index: number; param: unknown }> =
      Reflect.getMetadata('self:paramtypes', Repo) ?? [];
    const byIndex = new Map(selfDeps.map((d) => [d.index, d.param]));

    expect(byIndex.get(0)).toBe(PRISMAKIT_PRISMA);
    expect(byIndex.get(1)).toBe(PRISMAKIT_CACHE);
    expect(byIndex.get(2)).toBe(RepositoryRegistry);
    expect(byIndex.get(3)).toBe(AutoComposer);
  });

  it('marks cache, registry, and AutoComposer as optional deps', () => {
    const Repo = createInjectableRepository({ model: 'user' });
    const optional: number[] = Reflect.getMetadata('optional:paramtypes', Repo) ?? [];
    expect(optional).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  it('passes registry and autoCompose into the repository base constructor', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: '1', name: 'Ada' });
    const prisma = { user: { findUnique } };
    const registry = new RepositoryRegistry();
    const compose = vi.fn(async (_model: string, row: unknown) => row);
    const autoCompose = { compose } as unknown as AutoComposer;

    const Repo = createInjectableRepository({
      model: 'user',
      scalarFields: { id: 'id', name: 'name' },
    });
    // Nest uses positional ctor args matching @Inject order
    const RepoCtor = Repo as unknown as new (
      ...args: unknown[]
    ) => {
      getById: (args: unknown) => Promise<unknown>;
    };
    const repo = new RepoCtor(prisma, undefined, registry, autoCompose);

    await repo.getById({
      id: '1',
      select: { id: true, name: true },
    });

    expect(findUnique).toHaveBeenCalled();
  });
});
