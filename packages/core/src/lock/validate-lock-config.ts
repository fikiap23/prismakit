import { RepositoryLockConfig } from '../types/row-lock-options.type';
import {
  expectedDbColumn,
  findModelByTableName,
  getScalarFields,
  getSchemaModels,
} from '../schema/parse-prisma-schema';

/**
 * Validates lock config against prisma/schema.prisma (@map / @@map).
 * Called at repository factory init — fails fast on misconfiguration.
 *
 * @param schemaPath - defaults to `process.cwd() + '/prisma/schema.prisma'`
 */
export function validateLockConfig(
  lock: RepositoryLockConfig,
  schemaPath?: string,
): void {
  const model = findModelByTableName(lock.tableName, schemaPath);
  if (!model) {
    const tables = getSchemaModels(schemaPath).map((m) => m.dbName ?? m.name);
    throw new Error(
      `Row lock: no Prisma model for table "${lock.tableName}". Known tables: ${tables.join(', ')}`,
    );
  }

  const columns = lock.columns ?? {};
  const scalarFields = getScalarFields(model);
  const errors: string[] = [];

  for (const field of scalarFields) {
    if (!field.dbName) continue;

    if (!(field.name in columns)) {
      errors.push(
        `missing lock.columns["${field.name}"] (Prisma @map("${field.dbName}"))`,
      );
      continue;
    }

    if (columns[field.name] !== field.dbName) {
      errors.push(
        `lock.columns["${field.name}"] is "${columns[field.name]}" but schema expects "${field.dbName}"`,
      );
    }
  }

  for (const [prismaField, dbColumn] of Object.entries(columns)) {
    const field = scalarFields.find((f) => f.name === prismaField);
    if (!field) {
      errors.push(
        `lock.columns["${prismaField}"] has no scalar field on model ${model.name}`,
      );
      continue;
    }

    const expected = expectedDbColumn(field);
    if (dbColumn !== expected) {
      errors.push(
        `lock.columns["${prismaField}"] is "${dbColumn}" but expected "${expected}"`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Row lock config invalid for table "${lock.tableName}" (model ${model.name}):\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}
