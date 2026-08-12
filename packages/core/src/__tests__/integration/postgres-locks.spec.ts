import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertLockPrerequisites,
  clearPrismaMeta,
  getDatasourceProvider,
  loadPrismaMetaFromSchema,
  LockNotAvailableError,
  parseDatasourceProvider,
  queryRowForUpdate,
  queryRowsForUpdate,
  setDatasourceProvider,
  UnsupportedProviderError,
} from '../../index';
import { createPgPrismaLike } from './pg-client';
import { requireEnv } from './require-integration';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const databaseUrl = requireEnv('DATABASE_URL');

/** Dedicated probe table — do not DROP Prisma-managed `pk_wallets`. */
const LOCK_TABLE = 'pk_lock_probe';

describe.skipIf(!databaseUrl)('postgres locks (integration)', () => {
  const { pool, prisma } = createPgPrismaLike(databaseUrl!);

  beforeAll(async () => {
    setDatasourceProvider('postgresql');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${LOCK_TABLE} (
        id TEXT PRIMARY KEY,
        balance INT NOT NULL DEFAULT 0
      )
    `);
  });

  afterEach(async () => {
    clearPrismaMeta();
    setDatasourceProvider('postgresql');
    await prisma.$executeRawUnsafe(`DELETE FROM ${LOCK_TABLE}`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${LOCK_TABLE} (id, balance) VALUES ($1, $2), ($3, $4)`,
      'w1',
      100,
      'w2',
      50,
    );
  });

  afterAll(async () => {
    await pool.end();
    clearPrismaMeta();
  });

  it('loads postgresql provider from a temp schema file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-lock-schema-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id String @id
}
`,
    );

    try {
      loadPrismaMetaFromSchema(schemaPath);
      expect(parseDatasourceProvider(schemaPath)).toBe('postgresql');
      expect(getDatasourceProvider()).toBe('postgresql');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws UnsupportedProviderError when provider is not postgres', () => {
    setDatasourceProvider('sqlite');
    const fakeTx = { $queryRawUnsafe: async () => [] };

    expect(() =>
      assertLockPrerequisites(fakeTx, {
        tableName: 'users',
        columns: { id: 'id' },
      }),
    ).toThrow(UnsupportedProviderError);
  });

  it('SELECT … FOR UPDATE returns the locked row', async () => {
    const lockConfig = {
      tableName: LOCK_TABLE,
      columns: { id: 'id', balance: 'balance' },
    };

    const row = await prisma.$transaction(async (tx) => {
      return queryRowForUpdate(tx, lockConfig, {
        id: 'w1',
        select: { id: true, balance: true },
        lock: { mode: 'update' },
      });
    });

    expect(row).toEqual({ id: 'w1', balance: 100 });
  });

  it('NOWAIT throws LockNotAvailableError when the row is held', async () => {
    const lockConfig = {
      tableName: LOCK_TABLE,
      columns: { id: 'id', balance: 'balance' },
    };

    const held = await pool.connect();
    try {
      await held.query('BEGIN');
      await held.query(
        `SELECT id, balance FROM ${LOCK_TABLE} WHERE id = $1 FOR UPDATE`,
        ['w1'],
      );

      await expect(
        prisma.$transaction(async (tx) =>
          queryRowForUpdate(tx, lockConfig, {
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

  it('SKIP LOCKED skips rows held by another transaction', async () => {
    const lockConfig = {
      tableName: LOCK_TABLE,
      columns: { id: 'id', balance: 'balance' },
    };

    const held = await pool.connect();
    try {
      await held.query('BEGIN');
      await held.query(
        `SELECT id FROM ${LOCK_TABLE} WHERE id = $1 FOR UPDATE`,
        ['w1'],
      );

      const rows = await prisma.$transaction(async (tx) =>
        queryRowsForUpdate(tx, lockConfig, {
          where: { id: { in: ['w1', 'w2'] } },
          select: { id: true, balance: true },
          lock: { mode: 'update', skipLocked: true },
          orderBy: { id: 'asc' },
        }),
      );

      expect(rows.map((r) => r.id)).toEqual(['w2']);
    } finally {
      await held.query('ROLLBACK');
      held.release();
    }
  });
});
