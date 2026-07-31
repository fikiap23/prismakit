import {
  RepositoryLockConfig,
  RowLockMode,
  RowLockOptions,
} from '../types/row-lock-options.type';

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

  if (opts.nowait) return `${base} NOWAIT`;
  if (opts.skipLocked) return `${base} SKIP LOCKED`;
  return base;
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

function quoteIdentifier(name: string): string {
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
}

type QueryRawClient = {
  $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
};

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
    id: string;
    select?: object;
    lock: RowLockOptions;
    idColumn?: string;
  },
): Promise<Record<string, unknown> | null> {
  const columnMap = config.columns ?? {};
  const dbColumns = selectToDbColumns(select, columnMap);

  const selectClause =
    dbColumns.length === 1 && dbColumns[0] === '*'
      ? '*'
      : dbColumns.map(quoteIdentifier).join(', ');

  const lockClause = buildLockClause(lock);
  const table = quoteIdentifier(config.tableName);
  const idCol = quoteIdentifier(columnMap[idColumn] ?? idColumn);

  const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT ${selectClause} FROM ${table} WHERE ${idCol} = $1 ${lockClause}`,
    id,
  );

  if (!rows.length) return null;
  return mapDbRowToPrisma(rows[0], columnMap);
}
