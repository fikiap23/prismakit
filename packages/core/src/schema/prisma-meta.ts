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
  /** Referenced fields on the *target* row (to-one) — PK or unique. */
  foreignFields: string[];
  /**
   * First FK scalar field on the *target* row used to group children (to-many /
   * reverse to-one). Derived from the opposite relation's `relationFromFields`.
   */
  targetFk?: string;
  /** Full opposite FK field list (composite-aware). */
  targetFkFields?: string[];
  /**
   * True when both sides are lists with empty `relationFromFields`
   * (Prisma implicit many-to-many). AutoComposer cannot load these.
   */
  implicitManyToMany?: boolean;
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
  /** Primary key field, or array for composite `@@id`. */
  primaryKey?: string | string[];
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

    let primaryKey: string | string[] | undefined;
    if (model.primaryKey?.fields?.length === 1) {
      primaryKey = model.primaryKey.fields[0];
    } else if (model.primaryKey?.fields && model.primaryKey.fields.length > 1) {
      primaryKey = [...model.primaryKey.fields];
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
      let targetFkFields: string[] | undefined;
      // many + reverse one (FK on target, e.g. UsagePart.sparepart → sourceUsagePartId)
      if (kind === 'many' || (kind === 'one' && from.length === 0)) {
        targetFkFields = findOppositeLocalFkFields(
          target,
          model.name,
          field.relationName,
        );
        targetFk = targetFkFields?.[0];
      }

      const oppositeIsList = target.fields.some(
        (f) =>
          f.kind === 'object' &&
          f.type === model.name &&
          f.isList &&
          (!field.relationName ||
            !f.relationName ||
            f.relationName === field.relationName),
      );
      const implicitManyToMany =
        kind === 'many' &&
        from.length === 0 &&
        oppositeIsList &&
        (!targetFkFields || targetFkFields.length === 0);

      relations[field.name] = {
        targetModel,
        targetModelName: field.type,
        kind,
        localFields: from,
        foreignFields: to,
        targetFk,
        targetFkFields,
        implicitManyToMany: implicitManyToMany || undefined,
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
      let targetFkFields: string[] | undefined;
      if (kind === 'many' || (kind === 'one' && from.length === 0)) {
        targetFkFields = findOppositeLocalFkFieldsFromSchema(
          target,
          model.name,
          field.relationName,
        );
        targetFk = targetFkFields?.[0];
      }

      const oppositeIsList = target.fields.some(
        (f) =>
          f.kind === 'relation' &&
          f.typeName === model.name &&
          f.isList &&
          (!field.relationName ||
            !f.relationName ||
            f.relationName === field.relationName),
      );
      const implicitManyToMany =
        kind === 'many' &&
        from.length === 0 &&
        oppositeIsList &&
        (!targetFkFields || targetFkFields.length === 0);

      relations[field.name] = {
        targetModel: pascalToRepoKey(field.typeName),
        targetModelName: field.typeName,
        kind,
        localFields: from,
        foreignFields: to,
        targetFk,
        targetFkFields,
        implicitManyToMany: implicitManyToMany || undefined,
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
 * Build metadata from Prisma 7 `runtimeDataModel` (often missing relationFromFields).
 *
 * Prefer {@link loadPrismaMetaFromDmmf} / {@link loadPrismaMetaFromSchema} for
 * free FK naming. This builder:
 * - uses `${relation}Id` when that scalar exists (owning to-one)
 * - detects reverse 1:1 when the opposite model owns a non-list FK back
 * - otherwise treats the relation as to-many
 * - honors optional `isList` / `relationFromFields` / `relationToFields` / `isId`
 *   when the runtime payload provides them
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
          isList?: boolean;
          isId?: boolean;
          relationFromFields?: readonly string[];
          relationToFields?: readonly string[];
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
        isList: f.isList ?? false,
        isId:
          f.isId ??
          (f.name === 'id' && (f.kind === 'scalar' || f.kind === 'enum')),
        dbName: f.dbName,
        relationName: f.relationName,
        relationFromFields: [...(f.relationFromFields ?? [])],
        relationToFields: [...(f.relationToFields ?? [])],
      })),
    }),
  );

  // Track which object fields had an explicit isList from the runtime payload
  const explicitList = new Set<string>();
  for (const [modelName, model] of Object.entries(runtime.models)) {
    for (const f of model.fields) {
      if (f.kind === 'object' && typeof f.isList === 'boolean') {
        explicitList.add(`${modelName}.${f.name}`);
      }
    }
  }

  // Infer owning to-one from `${field}Id` when from-fields absent
  for (const model of dmmfModels) {
    const scalarNames = new Set(
      model.fields
        .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
        .map((f) => f.name),
    );
    for (const field of model.fields) {
      if (field.kind !== 'object') continue;
      if ((field.relationFromFields?.length ?? 0) > 0) {
        field.isList = false;
        continue;
      }

      const key = `${model.name}.${field.name}`;
      if (explicitList.has(key)) {
        // Trust caller-provided isList (needed for reverse 1:1 vs 1:N)
        continue;
      }

      const localFk = `${field.name}Id`;
      if (scalarNames.has(localFk)) {
        field.isList = false;
        field.relationFromFields = [localFk];
        if (!field.relationToFields?.length) {
          field.relationToFields = ['id'];
        }
      } else {
        // Default to-many when runtime omits isList / from-fields.
        // Reverse 1:1 requires explicit isList: false or full DMMF/schema meta.
        field.isList = true;
      }
    }
  }

  return buildPrismaMetaFromDmmf({ models: dmmfModels });
}

function findOppositeLocalFkFields(
  target: DmmfModelLike,
  sourceModelName: string,
  relationName?: string | null,
): string[] | undefined {
  for (const field of target.fields) {
    if (field.kind !== 'object') continue;
    if (field.type !== sourceModelName) continue;
    if (relationName && field.relationName && field.relationName !== relationName) {
      continue;
    }
    const from = field.relationFromFields ?? [];
    if (from.length > 0) return [...from];
  }
  return undefined;
}

function findOppositeLocalFkFieldsFromSchema(
  target: SchemaModel,
  sourceModelName: string,
  relationName?: string,
): string[] | undefined {
  for (const field of target.fields) {
    if (field.kind !== 'relation') continue;
    if (field.typeName !== sourceModelName) continue;
    if (relationName && field.relationName && field.relationName !== relationName) {
      continue;
    }
    const from = field.relationFromFields ?? [];
    if (from.length > 0) return [...from];
  }
  return undefined;
}
