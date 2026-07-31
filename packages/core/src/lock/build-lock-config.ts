import { RepositoryLockConfig } from '../types/row-lock-options.type';
import {
  findModelByName,
  findModelByTableName,
  getScalarFields,
  getSchemaModels,
  pascalToRepoKey,
} from '../schema/parse-prisma-schema';
import { getModelMeta, getPrismaMeta } from '../schema/prisma-meta';

/**
 * Build row-lock config from Prisma metadata or `schema.prisma`.
 *
 * Accepts:
 * - DB table name (`@@map` value) — legacy
 * - Prisma client model key (`user`) or Pascal model name (`User`)
 *
 * Columns include every scalar/enum (`@map` or field name).
 */
export function buildLockConfigFromSchema(
  tableOrModel: string,
  schemaPath?: string,
): RepositoryLockConfig {
  const fromMeta = resolveLockFromMeta(tableOrModel);
  if (fromMeta) return fromMeta;

  const model =
    findModelByTableName(tableOrModel, schemaPath) ??
    findModelByName(tableOrModel, schemaPath);

  if (!model) {
    const tables = getSchemaModels(schemaPath).map((m) => m.dbName ?? m.name);
    const keys = getSchemaModels(schemaPath).map((m) => pascalToRepoKey(m.name));
    throw new Error(
      `buildLockConfigFromSchema: no Prisma model for "${tableOrModel}". Known tables: ${tables.join(', ')}; known models: ${keys.join(', ')}`,
    );
  }

  const columns: Record<string, string> = {};
  for (const field of getScalarFields(model)) {
    columns[field.name] = field.dbName ?? field.name;
  }

  return {
    tableName: model.dbName ?? model.name,
    columns,
  };
}

/** Resolve lock config from the process-wide Prisma meta registry. */
export function buildLockConfigFromMeta(
  clientKeyOrTable: string,
): RepositoryLockConfig | undefined {
  return resolveLockFromMeta(clientKeyOrTable);
}

function resolveLockFromMeta(
  tableOrModel: string,
): RepositoryLockConfig | undefined {
  const meta = getPrismaMeta();
  if (!meta) return undefined;

  const byKey = getModelMeta(tableOrModel) ?? meta[tableOrModel];
  if (byKey) {
    return { tableName: byKey.dbTable, columns: { ...byKey.columnMap } };
  }

  for (const model of Object.values(meta)) {
    if (
      model.dbTable === tableOrModel ||
      model.modelName === tableOrModel ||
      model.clientKey === tableOrModel
    ) {
      return { tableName: model.dbTable, columns: { ...model.columnMap } };
    }
  }

  return undefined;
}
