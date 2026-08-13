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

  const make = (model: string) =>
    new (createRepository({
      model,
      cache: { ttl: 300, defaultSetCache: false },
    }))(deps);

  const repos = {
    user: make('user'),
    profile: make('profile'),
    post: make('post'),
    category: make('category'),
    tag: make('tag'),
    postTag: make('postTag'),
    warehouse: make('warehouse'),
    stock: make('stock'),
    comment: make('comment'),
  };

  return { prisma, cache, registry, autoCompose, deps, repos };
}
