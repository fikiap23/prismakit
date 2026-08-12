import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AutoComposer,
  clearPrismaMeta,
  createRepository,
  loadPrismaMetaFromSchema,
  RepositoryRegistry,
  type CacheOptions,
  type RepositoryDeps,
} from '../../index';
import { RedisCacheAdapter } from '../../../../redis/src/redis-cache-adapter';
import { requireEnv } from './require-integration';

export const INTEGRATION_SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma-integration/schema.prisma',
);

export type PgRedisKit = {
  prisma: any;
  cache: RedisCacheAdapter;
  registry: RepositoryRegistry;
  autoCompose: AutoComposer;
  deps: RepositoryDeps;
  repos: Record<string, any>;
  prefix: string;
  disconnect: () => Promise<void>;
};

export function requirePgRedisUrls(): {
  databaseUrl: string | undefined;
  redisUrl: string | undefined;
} {
  return {
    databaseUrl: requireEnv('DATABASE_URL'),
    redisUrl: requireEnv('REDIS_URL'),
  };
}

export async function resetIntegrationDb(prisma: any): Promise<void> {
  // Single atomic wipe — safe under parallel vitest files sharing one DB.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "post_tags",
      "comments",
      "tbl_posts",
      "stocks",
      "tags",
      "kategori",
      "m_profile",
      "wh",
      "m_user",
      "pk_wallets"
    RESTART IDENTITY CASCADE
  `);
}

/** Deterministic seed matching smoke-test fixtures (+ wallets). */
export async function seedIntegrationDb(prisma: any): Promise<void> {
  await resetIntegrationDb(prisma);

  await prisma.user.createMany({
    data: [
      { uid: 'u1', name: 'Ada', password: 'secret' },
      { uid: 'u2', name: 'Bob', password: 'secret2' },
    ],
  });

  await prisma.profile.create({
    data: { id: 'pr1', bio: 'mathematician', ownerUid: 'u1' },
  });

  await prisma.category.create({
    data: { code: 'tech', label: 'Technology' },
  });

  await prisma.post.createMany({
    data: [
      {
        postId: 'p1',
        title: 'Hello',
        writerRef: 'u1',
        editorRef: 'u2',
        categoryCode: 'tech',
      },
      {
        postId: 'p2',
        title: 'World',
        writerRef: 'u1',
        editorRef: 'u1',
        categoryCode: 'tech',
      },
    ],
  });

  await prisma.tag.createMany({
    data: [
      { id: 't1', name: 'ts' },
      { id: 't2', name: 'node' },
    ],
  });

  await prisma.postTag.createMany({
    data: [
      { postId: 'p1', tagId: 't1' },
      { postId: 'p1', tagId: 't2' },
      { postId: 'p2', tagId: 't1' },
    ],
  });

  await prisma.warehouse.create({
    data: { id: 'w1', code: 'WH-A', name: 'Alpha' },
  });

  await prisma.stock.create({
    data: { id: 's1', qty: 42, warehouseCode: 'WH-A' },
  });

  await prisma.comment.createMany({
    data: [
      { id: 'c1', body: 'root', authorUid: 'u1', parentId: null },
      { id: 'c2', body: 'reply-1', authorUid: 'u2', parentId: 'c1' },
      { id: 'c3', body: 'reply-2', authorUid: 'u1', parentId: 'c1' },
    ],
  });

  await prisma.wallet.createMany({
    data: [
      { id: 'w1', balance: 100 },
      { id: 'w2', balance: 50 },
    ],
  });
}

export type CreatePgRedisKitOptions = {
  databaseUrl: string;
  redisUrl: string;
  prefix?: string;
  cache?: CacheOptions | true;
};

/**
 * Shared Prisma + Redis + AutoComposer kit for PG/Redis integration suites.
 */
export async function createPgRedisKit(
  options: CreatePgRedisKitOptions,
): Promise<PgRedisKit> {
  clearPrismaMeta();
  loadPrismaMetaFromSchema(INTEGRATION_SCHEMA_PATH);

  const mod = await import('./generated/client/index.js');
  const prisma = new mod.PrismaClient({
    datasources: { db: { url: options.databaseUrl } },
  });

  const prefix = options.prefix ?? `pk-it-${Date.now()}`;
  const cache = new RedisCacheAdapter({
    url: options.redisUrl,
    prefix,
  });

  // Wait briefly for Redis ready (lazyConnect).
  await new Promise((r) => setTimeout(r, 50));

  const registry = new RepositoryRegistry();
  const autoCompose = new AutoComposer(registry);
  const cacheOpts = options.cache ?? {
    ttl: 300,
    nullTtl: 2,
    defaultSetCache: false,
    sensitiveFields: ['password'],
  };
  const deps: RepositoryDeps = {
    prisma,
    cache,
    registry,
    autoCompose,
  };

  const make = (
    model: string,
    extra?: { lock?: true | string; cache?: CacheOptions | true },
  ) =>
    new (createRepository({
      model,
      cache: extra?.cache ?? cacheOpts,
      lock: extra?.lock,
      schemaPath: INTEGRATION_SCHEMA_PATH,
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
    wallet: make('wallet', { lock: true }),
  };

  return {
    prisma,
    cache,
    registry,
    autoCompose,
    deps,
    repos,
    prefix,
    disconnect: async () => {
      await prisma.$disconnect();
      await cache.disconnect();
      clearPrismaMeta();
    },
  };
}
