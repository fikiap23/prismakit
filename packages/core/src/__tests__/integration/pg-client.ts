import pg from 'pg';

export type PgTx = {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

export type PgPrismaLike = {
  $transaction: <T>(
    fn: (tx: PgTx) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ) => Promise<T>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
};

/** Thin Prisma-like client over `pg` for lock / raw SQL integration tests. */
export function createPgPrismaLike(connectionString: string): {
  pool: pg.Pool;
  prisma: PgPrismaLike;
} {
  const pool = new pg.Pool({ connectionString });

  const runQuery = async <T>(
    client: pg.Pool | pg.PoolClient,
    sql: string,
    values: unknown[],
  ): Promise<T> => {
    try {
      const result = await client.query(sql, values);
      return result.rows as T;
    } catch (err) {
      const e = err as Error & { code?: string };
      // Align with wrapPrismaError / Prisma-style lock failures.
      if (e.code === '55P03') {
        (e as { code: string }).code = '55P03';
      }
      throw e;
    }
  };

  const prisma: PgPrismaLike = {
    $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) =>
      runQuery<T>(pool, sql, values),
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) => {
      const result = await pool.query(sql, values);
      return result.rowCount ?? 0;
    },
    $transaction: async <T>(fn: (tx: PgTx) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: PgTx = {
          $queryRawUnsafe: <TRow>(sql: string, ...values: unknown[]) =>
            runQuery<TRow>(client, sql, values),
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };

  return { pool, prisma };
}
