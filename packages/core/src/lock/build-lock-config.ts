import { RepositoryLockConfig } from '../types/row-lock-options.type';
import {
  findModelByTableName,
  getScalarFields,
  getSchemaModels,
} from '../schema/parse-prisma-schema';

/**
 * Build row-lock config from prisma/schema.prisma (`@@map` / `@map`).
 * Only scalar/enum fields with `@map` are included — matches `validateLockConfig`.
 *
 * @param tableName - DB table name (`@@map` value)
 * @param schemaPath - defaults to `process.cwd() + '/prisma/schema.prisma'`
 */
export function buildLockConfigFromSchema(
  tableName: string,
  schemaPath?: string,
): RepositoryLockConfig {
  const model = findModelByTableName(tableName, schemaPath);
  if (!model) {
    const tables = getSchemaModels(schemaPath).map((m) => m.dbName ?? m.name);
    throw new Error(
      `buildLockConfigFromSchema: no Prisma model for table "${tableName}". Known tables: ${tables.join(', ')}`,
    );
  }

  const columns: Record<string, string> = {};
  for (const field of getScalarFields(model)) {
    if (!field.dbName) continue;
    columns[field.name] = field.dbName;
  }

  return { tableName, columns };
}
