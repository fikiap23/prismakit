import { PrismaClient, Prisma } from '@prisma/client';
import {
  AutoComposer,
  RepositoryRegistry,
  createRepository,
  loadPrismaMetaFromDmmf,
  type RepositoryDeps,
} from '@prismakit/core';
import { MemoryCacheAdapter } from '@prismakit/memory';

export type SmokeRepos = {
  prisma: PrismaClient;
  cache: MemoryCacheAdapter;
  registry: RepositoryRegistry;
  autoCompose: AutoComposer;
  deps: RepositoryDeps;
  repos: Record<string, any>;
};

export function createSmokeKit(): SmokeRepos {
  loadPrismaMetaFromDmmf(Prisma.dmmf);

  const prisma = new PrismaClient();
  const cache = new MemoryCacheAdapter({ prefix: 'smoke', maxSize: 5000 });
  const registry = new RepositoryRegistry();
  const autoCompose = new AutoComposer(registry);
  const deps: RepositoryDeps = { prisma: prisma as any, cache, registry, autoCompose };

  const make = (
    model: string,
    primaryKey: string | string[],
    scalarFields: Record<string, string>,
  ) =>
    new (createRepository({
      model,
      primaryKey,
      scalarFields,
      cache: { ttl: 300, defaultSetCache: false },
    }))(deps);

  const repos = {
    user: make('user', 'uid', { ...Prisma.UserScalarFieldEnum }),
    profile: make('profile', 'id', { ...Prisma.ProfileScalarFieldEnum }),
    post: make('post', 'postId', { ...Prisma.PostScalarFieldEnum }),
    category: make('category', 'code', { ...Prisma.CategoryScalarFieldEnum }),
    tag: make('tag', 'id', { ...Prisma.TagScalarFieldEnum }),
    postTag: make('postTag', ['postId', 'tagId'], {
      ...Prisma.PostTagScalarFieldEnum,
    }),
    warehouse: make('warehouse', 'id', { ...Prisma.WarehouseScalarFieldEnum }),
    stock: make('stock', 'id', { ...Prisma.StockScalarFieldEnum }),
    comment: make('comment', 'id', { ...Prisma.CommentScalarFieldEnum }),
  };

  return { prisma, cache, registry, autoCompose, deps, repos };
}
