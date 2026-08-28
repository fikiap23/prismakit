import { createRepository, type RepositoryDeps } from '../../create-repository';
import { AutoComposer } from '../../auto-composer';
import { RepositoryRegistry } from '../../repository-registry';
import {
  clearPrismaMeta,
  loadPrismaMetaFromDmmf,
  type PrismaDmmfLike,
} from '../../schema/prisma-meta';
import { setComposeOptions } from '../../compose/compose-options';
import { setTaggedJsonOptions } from '../../codec/tagged-json';
import { createFakePrisma, type FakePrismaClient } from './fake-prisma';
import { TestMemoryCache } from './test-memory-cache';
import { messyDmmf, simpleDmmf } from './messy-dmmf';

export { createFakePrisma, TestMemoryCache, messyDmmf, simpleDmmf };
export type { FakePrismaClient };

export type RepoBundle = {
  prisma: FakePrismaClient;
  registry: RepositoryRegistry;
  autoCompose: AutoComposer;
  cache: TestMemoryCache;
  deps: RepositoryDeps;
  repos: Record<string, any>;
};

export function resetGlobals(): void {
  clearPrismaMeta();
  setComposeOptions(undefined);
  setTaggedJsonOptions(undefined);
}

export function setupMessyWorld(seed?: {
  models?: Record<string, { rows: Record<string, unknown>[]; primaryKey?: string | string[] }>;
}): RepoBundle {
  resetGlobals();
  loadPrismaMetaFromDmmf(messyDmmf);

  const defaultModels: Record<
    string,
    { rows: Record<string, unknown>[]; primaryKey?: string | string[] }
  > = {
    user: { rows: [], primaryKey: 'uid' },
    profile: { rows: [] },
    post: { rows: [], primaryKey: 'postId' },
    category: { rows: [], primaryKey: 'code' },
    tag: { rows: [] },
    postTag: { rows: [], primaryKey: ['postId', 'tagId'] },
    warehouse: { rows: [] },
    stock: { rows: [] },
    order: { rows: [], primaryKey: ['tenantId', 'orderNo'] },
    orderLine: { rows: [] },
    comment: { rows: [] },
  };

  const prisma = createFakePrisma({
    models: { ...defaultModels, ...(seed?.models ?? {}) },
  });

  const registry = new RepositoryRegistry();
  const autoCompose = new AutoComposer(registry);
  const cache = new TestMemoryCache('messy');
  const deps: RepositoryDeps = { prisma, registry, autoCompose, cache };

  const modelNames = Object.keys(defaultModels);
  const repos: Record<string, any> = {};

  for (const model of modelNames) {
    const Repo = createRepository({
      model,
      cache: { ttl: 300, defaultSetCache: false },
      lock: true,
    });
    repos[model] = new Repo(deps);
  }

  return { prisma, registry, autoCompose, cache, deps, repos };
}

export function setupSimpleWorld(seed?: {
  models?: Record<string, { rows: Record<string, unknown>[]; primaryKey?: string | string[] }>;
  dmmf?: PrismaDmmfLike;
}): RepoBundle {
  resetGlobals();
  loadPrismaMetaFromDmmf(seed?.dmmf ?? simpleDmmf);

  const defaultModels: Record<
    string,
    { rows: Record<string, unknown>[]; primaryKey?: string | string[] }
  > = {
    user: { rows: [] },
    post: { rows: [] },
    postTag: { rows: [], primaryKey: ['postId', 'tagId'] },
  };

  const prisma = createFakePrisma({
    models: { ...defaultModels, ...(seed?.models ?? {}) },
  });

  const registry = new RepositoryRegistry();
  const autoCompose = new AutoComposer(registry);
  const cache = new TestMemoryCache('simple');
  const deps: RepositoryDeps = { prisma, registry, autoCompose, cache };

  const repos: Record<string, any> = {};
  for (const model of ['user', 'post', 'postTag'] as const) {
    const Repo = createRepository({
      model,
      cache: { ttl: 300, defaultSetCache: false, sensitiveFields: ['password'] },
      lock: true,
    });
    repos[model] = new Repo(deps);
  }

  return { prisma, registry, autoCompose, cache, deps, repos };
}
