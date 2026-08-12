import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  LockNotAvailableError,
  createRepository,
  AutoComposer,
  RepositoryRegistry,
  loadPrismaMetaFromSchema,
  clearPrismaMeta,
} from '@prismakit/core';
import { RedisCacheAdapter } from '@prismakit/redis';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

function requireEnv(name: 'DATABASE_URL' | 'REDIS_URL'): string | undefined {
  const value = process.env[name];
  if (value) return value;
  if (process.env.FORCE_INTEGRATION === '1' || process.env.CI === 'true') {
    throw new Error(
      `[PrismaKit] ${name} is required for integration tests when CI=true or FORCE_INTEGRATION=1`,
    );
  }
  return undefined;
}

const databaseUrl = requireEnv('DATABASE_URL');
const redisUrl = requireEnv('REDIS_URL');
const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../core/prisma-integration/schema.prisma',
);

describe.skipIf(!databaseUrl || !redisUrl)(
  'repo-level row locks (integration)',
  () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prisma: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let wallets: any;
    let cache: RedisCacheAdapter;
    let pool: pg.Pool;

    beforeAll(async () => {
      clearPrismaMeta();
      loadPrismaMetaFromSchema(schemaPath);
      const mod = await import(
        '../../../../core/src/__tests__/integration/generated/client/index.js'
      );
      prisma = new mod.PrismaClient({
        datasources: { db: { url: databaseUrl } },
      });
      cache = new RedisCacheAdapter({
        url: redisUrl,
        prefix: `pk-locks-${Date.now()}`,
      });
      pool = new pg.Pool({ connectionString: databaseUrl });

      const registry = new RepositoryRegistry();
      const autoCompose = new AutoComposer(registry);
      wallets = new (createRepository({
        model: 'wallet',
        lock: true,
        cache: { ttl: 60, defaultSetCache: true },
        schemaPath,
      }))({ prisma, cache, registry, autoCompose });
    });

    beforeEach(async () => {
      await prisma.wallet.deleteMany();
      await prisma.wallet.createMany({
        data: [
          { id: 'w1', balance: 100 },
          { id: 'w2', balance: 50 },
        ],
      });
      await wallets.invalidateCache({});
    });

    afterAll(async () => {
      await prisma?.$disconnect?.();
      await cache?.disconnect?.();
      await pool?.end();
      clearPrismaMeta();
    });

    it('getById with lock:update inside $transaction returns the row', async () => {
      const row = await prisma.$transaction(async (tx: unknown) => {
        return wallets.getById({
          tx,
          id: 'w1',
          select: { id: true, balance: true },
          lock: { mode: 'update' },
        });
      });
      expect(row).toEqual({ id: 'w1', balance: 100 });
    });

    it('getFirst with lock:update works inside a transaction', async () => {
      const row = await prisma.$transaction(async (tx: unknown) => {
        return wallets.getFirst({
          tx,
          where: { id: 'w2' },
          select: { id: true, balance: true },
          lock: { mode: 'update' },
        });
      });
      expect(row).toEqual({ id: 'w2', balance: 50 });
    });

    it('nowait throws LockNotAvailableError when row is held', async () => {
      const held = await pool.connect();
      try {
        await held.query('BEGIN');
        await held.query(
          `SELECT id FROM pk_wallets WHERE id = $1 FOR UPDATE`,
          ['w1'],
        );

        await expect(
          prisma.$transaction(async (tx: unknown) =>
            wallets.getById({
              tx,
              id: 'w1',
              select: { id: true, balance: true },
              lock: { mode: 'update', nowait: true },
            }),
          ),
        ).rejects.toBeInstanceOf(LockNotAvailableError);
      } finally {
        await held.query('ROLLBACK');
        held.release();
      }
    });

    it('skipLocked on getMany skips held rows', async () => {
      const held = await pool.connect();
      try {
        await held.query('BEGIN');
        await held.query(
          `SELECT id FROM pk_wallets WHERE id = $1 FOR UPDATE`,
          ['w1'],
        );

        const rows = await prisma.$transaction(async (tx: unknown) =>
          wallets.getMany({
            tx,
            where: { id: { in: ['w1', 'w2'] } },
            select: { id: true, balance: true },
            orderBy: { id: 'asc' },
            lock: { mode: 'update', skipLocked: true },
          }),
        );

        expect(rows.map((r: { id: string }) => r.id)).toEqual(['w2']);
      } finally {
        await held.query('ROLLBACK');
        held.release();
      }
    });

    it('locked read inside tx does not write cache', async () => {
      await prisma.$transaction(async (tx: unknown) => {
        await wallets.getById({
          tx,
          id: 'w1',
          select: { id: true, balance: true },
          lock: { mode: 'update' },
          setCache: true,
        });
      });

      await prisma.wallet.update({
        where: { id: 'w1' },
        data: { balance: 999 },
      });

      // If lock path had cached, we would still see 100
      const fresh = await wallets.getById({
        id: 'w1',
        select: { id: true, balance: true },
        setCache: false,
      });
      expect(fresh?.balance).toBe(999);
    });
  },
);
