import { RepositoryLockConfig } from '../types/row-lock-options.type';
import {
  expectedDbColumn,
  findModelByName,
  findModelByTableName,
  getScalarFields,
  getSchemaModels,
  pascalToRepoKey,
} from '../schema/parse-prisma-schema';
import { getPrismaMeta } from '../schema/prisma-meta';

/**
 * Validates lock config against Prisma meta or `schema.prisma`.
 * Called at repository factory init — fails fast on misconfiguration.
 *
 * @param schemaPath - defaults to `process.cwd() + '/prisma/schema.prisma'`
 */
export function validateLockConfig(
  lock: RepositoryLockConfig,
  schemaPath?: string,
): void {
  const meta = getPrismaMeta();
  if (meta) {
    const model = Object.values(meta).find(
      (m) => m.dbTable === lock.tableName,
    );
    if (!model) {
      const tables = Object.values(meta).map((m) => m.dbTable);
      throw new Error(
        `Row lock: no Prisma model for table "${lock.tableName}". Known tables: ${tables.join(', ')}`,
      );
    }

    const columns = lock.columns ?? {};
    const errors: string[] = [];

    for (const [field, expected] of Object.entries(model.columnMap)) {
      if (!(field in columns)) {
        // Only require entries that differ from the Prisma field name, or all —
        // require all mapped columns to match when present.
        continue;
      }
      if (columns[field] !== expected) {
        errors.push(
          `lock.columns["${field}"] is "${columns[field]}" but schema expects "${expected}"`,
        );
      }
    }

    for (const [prismaField, dbColumn] of Object.entries(columns)) {
      const expected = model.columnMap[prismaField];
      if (expected === undefined) {
        errors.push(
          `lock.columns["${prismaField}"] has no scalar field on model ${model.modelName}`,
        );
        continue;
      }
      if (dbColumn !== expected) {
        errors.push(
          `lock.columns["${prismaField}"] is "${dbColumn}" but expected "${expected}"`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Row lock config invalid for table "${lock.tableName}" (model ${model.modelName}):\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      );
    }
    return;
  }

  const model =
    findModelByTableName(lock.tableName, schemaPath) ??
    findModelByName(lock.tableName, schemaPath);
  if (!model) {
    const tables = getSchemaModels(schemaPath).map((m) => m.dbName ?? m.name);
    const keys = getSchemaModels(schemaPath).map((m) => pascalToRepoKey(m.name));
    throw new Error(
      `Row lock: no Prisma model for table "${lock.tableName}". Known tables: ${tables.join(', ')}; models: ${keys.join(', ')}`,
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
