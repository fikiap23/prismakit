import {
  getSchemaModels,
  pascalToRepoKey,
  type SchemaModel,
} from './parse-prisma-schema';

/** Cardinality of a Prisma relation field on the source model. */
export type RelationKind = 'one' | 'many';

/**
 * Per-relation metadata used by splitSelect / AutoComposer.
 * `targetModel` is the registry / Prisma client key (camelCase).
 */
export type RelationMeta = {
  targetModel: string;
  /** Prisma model name (PascalCase) of the target. */
  targetModelName: string;
  kind: RelationKind;
  /** FK scalar fields on the *source* row (to-one). Empty for to-many. */
  localFields: string[];
  /** Referenced PK fields on the *target* row (to-one). */
  foreignFields: string[];
  /**
   * FK scalar field on the *target* row used to group children (to-many).
   * Derived from the opposite relation's `relationFromFields[0]`.
   */
  targetFk?: string;
  /** Shared Prisma `@relation("…")` name when present. */
  relationName?: string;
};

export type ModelMeta = {
  /** Registry / Prisma client key (`user`, `auditLog`). */
  clientKey: string;
  /** Prisma model name (`User`). */
  modelName: string;
  /** DB table name (`@@map` or model name). */
  dbTable: string;
  /** Single-field primary key (composite PKs omitted → undefined). */
  primaryKey?: string;
  /** Scalar + enum field names → themselves (ScalarFieldEnum shape). */
  scalarFields: Record<string, string>;
  /** Prisma field → DB column (`@map` or field name). */
  columnMap: Record<string, string>;
  relations: Record<string, RelationMeta>;
};

export type PrismaMetaRegistry = Readonly<Record<string, ModelMeta>>;

/** Minimal DMMF datamodel shape (Prisma 5+/6+/7). */
export type DmmfDatamodelLike = {
  models: DmmfModelLike[];
};

export type DmmfModelLike = {
  name: string;
  dbName?: string | null;
  primaryKey?: { name: string | null; fields: string[] } | null;
  fields: DmmfFieldLike[];
};

export type DmmfFieldLike = {
  name: string;
  kind: string;
  type: string;
  isList: boolean;
  isId?: boolean;
  dbName?: string | null;
  relationName?: string | null;
  relationFromFields?: readonly string[];
  relationToFields?: readonly string[];
};

export type PrismaDmmfLike = {
  datamodel: DmmfDatamodelLike;
};

let globalPrismaMeta: PrismaMetaRegistry | null = null;

/** Replace the process-wide Prisma metadata registry. */
export function setPrismaMeta(meta: PrismaMetaRegistry): void {
  globalPrismaMeta = meta;
}

/** Clear metadata (tests). */
export function clearPrismaMeta(): void {
  globalPrismaMeta = null;
}

export function getPrismaMeta(): PrismaMetaRegistry | null {
  return globalPrismaMeta;
}

export function getModelMeta(clientKey: string): ModelMeta | undefined {
  return globalPrismaMeta?.[clientKey];
}

/**
 * Build registry keyed by Prisma client delegate names from DMMF.
 */
export function buildPrismaMetaFromDmmf(
  dmmf: PrismaDmmfLike | DmmfDatamodelLike,
): PrismaMetaRegistry {
  const datamodel = 'datamodel' in dmmf ? dmmf.datamodel : dmmf;
  const byName = new Map(datamodel.models.map((m) => [m.name, m]));
  const result: Record<string, ModelMeta> = {};

  for (const model of datamodel.models) {
    const clientKey = pascalToRepoKey(model.name);
    const scalarFields: Record<string, string> = {};
    const columnMap: Record<string, string> = {};
    const relations: Record<string, RelationMeta> = {};

    let primaryKey: string | undefined;
    if (model.primaryKey?.fields?.length === 1) {
      primaryKey = model.primaryKey.fields[0];
    } else {
      const idField = model.fields.find((f) => f.isId);
      if (idField) primaryKey = idField.name;
    }

    for (const field of model.fields) {
      if (field.kind === 'scalar' || field.kind === 'enum') {
        scalarFields[field.name] = field.name;
        columnMap[field.name] = field.dbName ?? field.name;
        continue;
      }

      if (field.kind !== 'object') continue;

      const target = byName.get(field.type);
      if (!target) continue;

      const targetModel = pascalToRepoKey(field.type);
      const from = [...(field.relationFromFields ?? [])];
      const to = [...(field.relationToFields ?? [])];
      const kind: RelationKind = field.isList ? 'many' : 'one';

      let targetFk: string | undefined;
      if (kind === 'many') {
        targetFk = findOppositeLocalFk(target, model.name, field.relationName);
      }

      relations[field.name] = {
        targetModel,
        targetModelName: field.type,
        kind,
        localFields: from,
        foreignFields: to,
        targetFk,
        relationName: field.relationName ?? undefined,
      };
    }

    result[clientKey] = {
      clientKey,
      modelName: model.name,
      dbTable: model.dbName ?? model.name,
      primaryKey,
      scalarFields,
      columnMap,
      relations,
    };
  }

  return result;
}

/**
 * Build metadata from parsed `schema.prisma` models (fallback when DMMF
 * is unavailable). Relation FK accuracy depends on `@relation(fields/…)`.
 */
export function buildPrismaMetaFromSchemaModels(
  models: SchemaModel[],
): PrismaMetaRegistry {
  const byName = new Map(models.map((m) => [m.name, m]));
  const result: Record<string, ModelMeta> = {};

  for (const model of models) {
    const clientKey = pascalToRepoKey(model.name);
    const scalarFields: Record<string, string> = {};
    const columnMap: Record<string, string> = {};
    const relations: Record<string, RelationMeta> = {};

    for (const field of model.fields) {
      if (field.kind === 'scalar' || field.kind === 'enum') {
        scalarFields[field.name] = field.name;
        columnMap[field.name] = field.dbName ?? field.name;
      }
    }

    for (const field of model.fields) {
      if (field.kind !== 'relation') continue;
      const target = byName.get(field.typeName);
      if (!target) continue;

      const kind: RelationKind = field.isList ? 'many' : 'one';
      const from = [...(field.relationFromFields ?? [])];
      const to = [...(field.relationToFields ?? [])];
      let targetFk: string | undefined;
      if (kind === 'many') {
        targetFk = findOppositeLocalFkFromSchema(
          target,
          model.name,
          field.relationName,
        );
      }

      relations[field.name] = {
        targetModel: pascalToRepoKey(field.typeName),
        targetModelName: field.typeName,
        kind,
        localFields: from,
        foreignFields: to,
        targetFk,
        relationName: field.relationName,
      };
    }

    result[clientKey] = {
      clientKey,
      modelName: model.name,
      dbTable: model.dbName ?? model.name,
      primaryKey: model.primaryKey,
      scalarFields,
      columnMap,
      relations,
    };
  }

  return result;
}

/** Load meta from DMMF and set the global registry. */
export function loadPrismaMetaFromDmmf(
  dmmf: PrismaDmmfLike | DmmfDatamodelLike,
): PrismaMetaRegistry {
  const meta = buildPrismaMetaFromDmmf(dmmf);
  setPrismaMeta(meta);
  return meta;
}

/** Load meta from a prisma schema file and set the global registry. */
export function loadPrismaMetaFromSchema(schemaPath?: string): PrismaMetaRegistry {
  const models = getSchemaModels(schemaPath);
  const meta = buildPrismaMetaFromSchemaModels(models);
  setPrismaMeta(meta);
  return meta;
}

/**
 * Build metadata from Prisma 7 `runtimeDataModel` (no relationFromFields).
 * FKs fall back to `${relation}Id` when present as scalars; prefer
 * {@link loadPrismaMetaFromSchema} for free FK naming.
 */
export function buildPrismaMetaFromRuntimeDataModel(
  runtime: {
    models: Record<
      string,
      {
        dbName?: string | null;
        fields: Array<{
          name: string;
          kind: string;
          type: string;
          dbName?: string | null;
          relationName?: string | null;
        }>;
      }
    >;
  },
): PrismaMetaRegistry {
  const dmmfModels: DmmfModelLike[] = Object.entries(runtime.models).map(
    ([name, model]) => ({
      name,
      dbName: model.dbName,
      primaryKey: null,
      fields: model.fields.map((f) => ({
        name: f.name,
        kind: f.kind,
        type: f.type,
        isList: false,
        isId: f.name === 'id' && f.kind === 'scalar',
        dbName: f.dbName,
        relationName: f.relationName,
        relationFromFields: [] as string[],
        relationToFields: [] as string[],
      })),
    }),
  );

  for (const model of dmmfModels) {
    const scalarNames = new Set(
      model.fields
        .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
        .map((f) => f.name),
    );
    for (const field of model.fields) {
      if (field.kind !== 'object') continue;
      const localFk = `${field.name}Id`;
      if (scalarNames.has(localFk)) {
        field.isList = false;
        field.relationFromFields = [localFk];
        field.relationToFields = ['id'];
      } else {
        field.isList = true;
      }
    }
  }

  return buildPrismaMetaFromDmmf({ models: dmmfModels });
}

function findOppositeLocalFk(
  target: DmmfModelLike,
  sourceModelName: string,
  relationName?: string | null,
): string | undefined {
  for (const field of target.fields) {
    if (field.kind !== 'object') continue;
    if (field.type !== sourceModelName) continue;
    if (relationName && field.relationName && field.relationName !== relationName) {
      continue;
    }
    const from = field.relationFromFields ?? [];
    if (from.length > 0) return from[0];
  }
  return undefined;
}

function findOppositeLocalFkFromSchema(
  target: SchemaModel,
  sourceModelName: string,
  relationName?: string,
): string | undefined {
  for (const field of target.fields) {
    if (field.kind !== 'relation') continue;
    if (field.typeName !== sourceModelName) continue;
    if (relationName && field.relationName && field.relationName !== relationName) {
      continue;
    }
    const from = field.relationFromFields ?? [];
    if (from.length > 0) return from[0];
  }
  return undefined;
}
