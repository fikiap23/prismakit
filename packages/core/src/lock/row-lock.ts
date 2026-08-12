import {
  RepositoryLockConfig,
  RowLockMode,
  RowLockOptions,
} from '../types/row-lock-options.type';
import { UnsupportedProviderError, wrapPrismaError } from '../errors';
import { getDatasourceProvider } from '../schema/prisma-meta';

const LOCK_MODE_SQL: Record<RowLockMode, string> = {
  update: 'FOR UPDATE',
  noKeyUpdate: 'FOR NO KEY UPDATE',
  share: 'FOR SHARE',
  keyShare: 'FOR KEY SHARE',
};

export function buildLockClause(opts: RowLockOptions): string {
  if (opts.nowait && opts.skipLocked) {
    throw new Error('Row lock: nowait and skipLocked are mutually exclusive');
  }

  const mode = opts.mode ?? 'noKeyUpdate';
  const base = LOCK_MODE_SQL[mode];

  const parts = [base];
  if (opts.nowait) parts.push('NOWAIT');
  if (opts.skipLocked) parts.push('SKIP LOCKED');
  return parts.join(' ');
}

export function selectToDbColumns(
  select: object | undefined,
  columnMap: Record<string, string>,
): string[] {
  if (!select || Object.keys(select).length === 0) {
    return ['*'];
  }

  return Object.entries(select)
    .filter(([, value]) => value === true)
    .map(([field]) => columnMap[field] ?? field);
}

export function mapDbRowToPrisma(
  row: Record<string, unknown>,
  columnMap: Record<string, string>,
): Record<string, unknown> {
  const dbToPrisma: Record<string, string> = {};
  for (const [prismaField, dbColumn] of Object.entries(columnMap)) {
    dbToPrisma[dbColumn] = prismaField;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[dbToPrisma[key] ?? key] = value;
  }
  return result;
}

export function quoteIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export function assertLockPrerequisites(
  tx: unknown,
  lockConfig: RepositoryLockConfig | undefined,
): asserts lockConfig is RepositoryLockConfig {
  if (!tx) {
    throw new Error('Row lock requires an active transaction (tx)');
  }
  if (!lockConfig?.tableName) {
    throw new Error(
      'Row lock is not enabled for this repository. Add lock config to createPrismaRepository options.',
    );
  }
  const provider = getDatasourceProvider();
  if (
    provider &&
    provider !== 'postgresql' &&
    provider !== 'postgres'
  ) {
    throw new UnsupportedProviderError(
      `Row locks (FOR UPDATE / SKIP LOCKED) require PostgreSQL; datasource provider is "${provider}"`,
      { provider, feature: 'row-lock' },
    );
  }
}

type QueryRawClient = {
  $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
};

function orderByToSql(
  orderBy: unknown,
  columnMap: Record<string, string>,
): string | undefined {
  if (!orderBy) return undefined;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts: string[] = [];
  for (const clause of clauses) {
    if (!clause || typeof clause !== 'object') continue;
    for (const [field, dir] of Object.entries(clause as Record<string, unknown>)) {
      const col = quoteIdentifier(columnMap[field] ?? field);
      const direction =
        String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      parts.push(`${col} ${direction}`);
    }
  }
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * SELECT … FOR UPDATE via parameterized `$queryRawUnsafe`.
 * Identifiers are validated/quoted; only `id` is bound as a parameter.
 */
export async function queryRowForUpdate(
  tx: QueryRawClient,
  config: RepositoryLockConfig,
  {
    id,
    select,
    lock,
    idColumn = 'id',
  }: {
    id: string | Record<string, string>;
    select?: object;
    lock: RowLockOptions;
    idColumn?: string | string[];
  },
): Promise<Record<string, unknown> | null> {
  if (Array.isArray(idColumn) && typeof id === 'string') {
    throw new Error(
      `Row lock: composite primaryKey [${idColumn.join(', ')}] requires id as object`,
    );
  }

  const where =
    typeof id === 'string'
      ? { [Array.isArray(idColumn) ? idColumn[0] : idColumn]: id }
      : id;

  const rows = await queryRowsForUpdate(tx, config, {
    where,
    select,
    lock,
    take: 1,
  });
  return rows[0] ?? null;
}

/**
 * SELECT … FOR UPDATE with a simple equality WHERE (scalars only).
 * Supports composite PKs and `getFirst`/`getMany` lock patterns.
 *
 * Only equality filters on known columns are supported (no nested Prisma filters).
 */
export async function queryRowsForUpdate(
  tx: QueryRawClient,
  config: RepositoryLockConfig,
  {
    where,
    select,
    lock,
    take,
    orderBy,
  }: {
    where: Record<string, unknown>;
    select?: object;
    lock: RowLockOptions;
    take?: number;
    orderBy?: unknown;
  },
): Promise<Record<string, unknown>[]> {
  const columnMap = config.columns ?? {};
  const dbColumns = selectToDbColumns(select, columnMap);

  const selectClause =
    dbColumns.length === 1 && dbColumns[0] === '*'
      ? '*'
      : dbColumns.map(quoteIdentifier).join(', ');

  const lockClause = buildLockClause(lock);
  const table = quoteIdentifier(config.tableName);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [field, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Skip complex Prisma filters — caller should use simple equality
      const obj = value as Record<string, unknown>;
      if ('in' in obj && Array.isArray(obj.in)) {
        if (obj.in.length === 0) {
          // Empty IN () is invalid SQL — short-circuit
          return [];
        }
        const placeholders = obj.in.map(() => `$${paramIndex++}`);
        const col = quoteIdentifier(columnMap[field] ?? field);
        conditions.push(`${col} IN (${placeholders.join(', ')})`);
        values.push(...obj.in);
        continue;
      }
      if ('equals' in obj) {
        const col = quoteIdentifier(columnMap[field] ?? field);
        conditions.push(`${col} = $${paramIndex++}`);
        values.push(obj.equals);
        continue;
      }
      throw new Error(
        `Row lock WHERE only supports equality / in filters; got complex filter on "${field}"`,
      );
    }
    const col = quoteIdentifier(columnMap[field] ?? field);
    if (value === null) {
      conditions.push(`${col} IS NULL`);
    } else {
      conditions.push(`${col} = $${paramIndex++}`);
      values.push(value);
    }
  }

  if (conditions.length === 0) {
    throw new Error('Row lock WHERE must include at least one equality filter');
  }

  let sql = `SELECT ${selectClause} FROM ${table} WHERE ${conditions.join(' AND ')}`;

  const orderSql = orderByToSql(orderBy, columnMap);
  if (orderSql) {
    sql += ` ORDER BY ${orderSql}`;
  }

  sql += ` ${lockClause}`;

  if (typeof take === 'number' && take > 0) {
    sql += ` LIMIT $${paramIndex++}`;
    values.push(take);
  }

  try {
    const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
      sql,
      ...values,
    );
    return rows.map((row) => mapDbRowToPrisma(row, columnMap));
  } catch (err) {
    wrapPrismaError(err);
    throw err;
  }
}
