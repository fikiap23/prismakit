import { splitSelect } from './utils/split-select';
import { RepositoryRegistry } from './repository-registry';
import { resolveRelationModel } from './compose/relation-resolver';
import { getModelMeta } from './schema/prisma-meta';
import {
  getComposeOptions,
  mergeComposeOptions,
  type ComposeOptions,
  type ResolvedComposeOptions,
} from './compose/compose-options';
import { emitTelemetry } from './telemetry/telemetry';

const COMPOSITE_KEY_SEP = '\u0000';

/**
 * Ensure relation target rows include the primary key so AutoComposer can map
 * them back onto parents (and nest further). Callers may omit `id` in nested
 * selects; without this injection every relation attaches as `null`.
 */
export function ensureSelectPrimaryKey(
  select: Record<string, any> | undefined,
  primaryKey: string | string[],
  scalarFields?: Record<string, string>,
): Record<string, any> | undefined {
  if (!select) return select;
  const keys = Array.isArray(primaryKey) ? primaryKey : [primaryKey];
  let next = select;
  for (const pk of keys) {
    if (scalarFields && !(pk in scalarFields)) continue;
    if (next[pk] === true) continue;
    next = { ...next, [pk]: true };
  }
  return next;
}

function ensureSelectFields(
  select: Record<string, any> | undefined,
  fields: string[],
  scalarFields?: Record<string, string>,
): Record<string, any> | undefined {
  if (!select || fields.length === 0) return select;
  let next = select;
  for (const field of fields) {
    if (scalarFields && !(field in scalarFields)) continue;
    if (next[field] === true) continue;
    next = { ...next, [field]: true };
  }
  return next;
}

function compositeKey(values: unknown[]): string {
  return values.map((v) => String(v)).join(COMPOSITE_KEY_SEP);
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/** Clone so parents never share the same relation object graph. */
function cloneAttachedRow<T extends Record<string, any>>(row: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(row);
    } catch {
      /* fall through */
    }
  }
  return { ...row };
}

function uniqueTuplesFrom(
  entities: Record<string, any>[],
  fields: string[],
): unknown[][] {
  const uniqueByKey = new Map<string, unknown[]>();
  for (const e of entities) {
    const vals = fields.map((f) => e[f]);
    if (!vals.every(isPresent)) continue;
    uniqueByKey.set(compositeKey(vals), vals);
  }
  return [...uniqueByKey.values()];
}

function whereFromTuples(
  fields: string[],
  tuples: unknown[][],
): Record<string, unknown> {
  if (fields.length === 1) {
    return { [fields[0]]: { in: tuples.map((vals) => vals[0]) } };
  }
  return {
    OR: tuples.map((vals) => {
      const clause: Record<string, unknown> = {};
      fields.forEach((f, i) => {
        clause[f] = vals[i];
      });
      return clause;
    }),
  };
}

function mergeWhereWithFk(
  fkWhere: Record<string, unknown>,
  nestedWhere?: Record<string, unknown>,
): Record<string, unknown> {
  if (!nestedWhere || Object.keys(nestedWhere).length === 0) return fkWhere;
  return { AND: [fkWhere, nestedWhere] };
}

function extractNestedArgs(relationSelect: unknown): {
  targetDbSelect: Record<string, any> | undefined;
  nestedWhere: Record<string, unknown> | undefined;
  nestedOrderBy: unknown;
  nestedTake: number | undefined;
} {
  if (relationSelect === true) {
    return {
      targetDbSelect: undefined,
      nestedWhere: undefined,
      nestedOrderBy: undefined,
      nestedTake: undefined,
    };
  }
  if (!relationSelect || typeof relationSelect !== 'object') {
    return {
      targetDbSelect: undefined,
      nestedWhere: undefined,
      nestedOrderBy: undefined,
      nestedTake: undefined,
    };
  }
  const rel = relationSelect as Record<string, any>;
  const nestedWhere =
    rel.where && typeof rel.where === 'object' ? rel.where : undefined;
  const nestedOrderBy = rel.orderBy;
  const nestedTake = typeof rel.take === 'number' ? rel.take : undefined;

  // Relation args without `select` (only where/orderBy/take) → empty scalar select
  if (!('select' in rel) && (nestedWhere || nestedOrderBy || nestedTake !== undefined)) {
    return {
      targetDbSelect: {},
      nestedWhere,
      nestedOrderBy,
      nestedTake,
    };
  }

  return {
    targetDbSelect: rel.select ?? rel,
    nestedWhere,
    nestedOrderBy,
    nestedTake,
  };
}

function fillMissingRelations(
  entities: Record<string, any>[],
  relations: Record<string, any>,
  sourceModel: string,
): void {
  const sourceMeta = getModelMeta(sourceModel);
  for (const relKey of Object.keys(relations)) {
    const kind = sourceMeta?.relations[relKey]?.kind;
    const empty = kind === 'many' ? [] : null;
    for (const e of entities) {
      if (e[relKey] === undefined) e[relKey] = empty;
    }
  }
}

export class AutoComposer {
  constructor(private readonly registry: RepositoryRegistry) {}

  async composeOne<T extends Record<string, any>>(
    entity: T,
    relations: Record<string, any> = {},
    sourceModel: string,
    composeOpts?: ComposeOptions,
  ): Promise<any> {
    if (!entity) return null;
    const [composed] = await this.composeMany(
      [entity],
      relations,
      sourceModel,
      composeOpts,
    );
    return composed;
  }

  async composeMany<T extends Record<string, any>>(
    entities: T[],
    relations: Record<string, any> = {},
    sourceModel: string,
    composeOpts?: ComposeOptions,
  ): Promise<any[]> {
    if (!entities.length || !Object.keys(relations).length) {
      return entities;
    }

    const opts = mergeComposeOptions(composeOpts);
    const started = Date.now();
    let queryCount = 0;

    emitTelemetry({
      type: 'compose.start',
      model: sourceModel,
      relationCount: Object.keys(relations).length,
      depth: 0,
    });

    await this.composeLevel(
      entities,
      relations,
      sourceModel,
      0,
      opts,
      () => {
        queryCount += 1;
      },
    );

    emitTelemetry({
      type: 'compose.complete',
      model: sourceModel,
      relationCount: Object.keys(relations).length,
      queryCount,
      durationMs: Date.now() - started,
    });

    return entities;
  }

  private async composeLevel<T extends Record<string, any>>(
    entities: T[],
    relations: Record<string, any>,
    sourceModel: string,
    depth: number,
    opts: ResolvedComposeOptions,
    onQuery: () => void,
  ): Promise<void> {
    if (!entities.length || !Object.keys(relations).length) return;

    if (depth >= opts.maxDepth) {
      console.warn(
        `[AutoComposer] maxDepth=${opts.maxDepth} reached for model "${sourceModel}" — skipping deeper relations`,
      );
      fillMissingRelations(entities, relations, sourceModel);
      emitTelemetry({
        type: 'compose.complete',
        model: sourceModel,
        relationCount: Object.keys(relations).length,
        queryCount: 0,
        durationMs: 0,
      });
      return;
    }

    const source = this.registry.get(sourceModel);
    const sourceMeta = getModelMeta(sourceModel);
    const sourceScalarFields =
      source?.scalarFields ?? sourceMeta?.scalarFields ?? {};
    const sourcePk = sourceMeta?.primaryKey ?? 'id';
    const sourcePkFields = Array.isArray(sourcePk) ? sourcePk : [sourcePk];

    const relKeys = Object.keys(relations);

    const runOne = async (relKey: string) => {
      const relMeta = sourceMeta?.relations[relKey];

      if (relMeta?.implicitManyToMany) {
        throw new Error(
          `[AutoComposer] Relation "${sourceModel}.${relKey}" is an implicit many-to-many. ` +
            `PrismaKit cannot auto-compose implicit m:n — use an explicit join model ` +
            `(e.g. PostTag) in the select, or load via Prisma include outside AutoComposer.`,
        );
      }

      const targetModel = resolveRelationModel(
        relKey,
        this.registry,
        sourceModel,
      );
      const target = this.registry.getOrThrow(targetModel);
      const targetMeta = getModelMeta(targetModel);
      const targetPk = targetMeta?.primaryKey ?? 'id';
      const targetPkFields = Array.isArray(targetPk) ? targetPk : [targetPk];
      const relationSelect = relations[relKey];

      let { targetDbSelect, nestedWhere, nestedOrderBy, nestedTake } =
        extractNestedArgs(relationSelect);
      let targetRelations: Record<string, any> = {};

      const targetScalars = target.scalarFields ?? targetMeta?.scalarFields;
      const targetRelFks = targetMeta
        ? Object.fromEntries(
            Object.entries(targetMeta.relations).map(([k, v]) => [
              k,
              v.localFields,
            ]),
          )
        : undefined;

      if (targetScalars && targetDbSelect) {
        const split = splitSelect(
          targetDbSelect,
          targetScalars,
          targetRelFks,
        );
        targetDbSelect = split.dbSelect as Record<string, any>;
        targetRelations = split.relations;
      }

      targetDbSelect = ensureSelectPrimaryKey(
        targetDbSelect,
        targetPk,
        targetScalars,
      );

      const localFields =
        relMeta?.localFields?.length
          ? [...relMeta.localFields]
          : `${relKey}Id` in sourceScalarFields
            ? [`${relKey}Id`]
            : [];
      const foreignFields =
        relMeta?.foreignFields?.length
          ? [...relMeta.foreignFields]
          : [...targetPkFields];

      const isOne = relMeta?.kind === 'one' || (!relMeta && localFields.length > 0);

      if (isOne && localFields.length > 0) {
        // Owning to-one — FK on source
        targetDbSelect = ensureSelectFields(
          targetDbSelect,
          foreignFields,
          targetScalars,
        );

        const uniqueTuples = uniqueTuplesFrom(entities, localFields);

        let related: any[] = [];
        if (uniqueTuples.length) {
          onQuery();
          related = await target.repository.getMany({
            where: whereFromTuples(foreignFields, uniqueTuples),
            select: targetDbSelect,
            setCache: opts.setCache,
            tx: opts.tx,
          });

          if (Object.keys(targetRelations).length > 0) {
            await this.composeLevel(
              related,
              targetRelations,
              targetModel,
              depth + 1,
              opts,
              onQuery,
            );
          }
        }

        const entityMap = new Map(
          related.map((e) => [
            compositeKey(foreignFields.map((f) => e[f])),
            e,
          ]),
        );
        entities.forEach((e: any) => {
          const vals = localFields.map((f) => e[f]);
          if (!vals.every(isPresent)) {
            e[relKey] = null;
            return;
          }
          const hit = entityMap.get(compositeKey(vals));
          // Clone so siblings with the same FK do not share one mutable object
          e[relKey] = hit ? cloneAttachedRow(hit) : null;
        });
      } else if (isOne && localFields.length === 0) {
        // Reverse 1:1 — FK lives on the target model
        const targetFkFields =
          relMeta?.targetFkFields?.length
            ? [...relMeta.targetFkFields]
            : relMeta?.targetFk
              ? [relMeta.targetFk]
              : [`${sourceModel}Id`];

        this.assertTargetFkFields(
          sourceModel,
          relKey,
          targetModel,
          targetFkFields,
          targetScalars,
        );

        targetDbSelect = ensureSelectFields(
          targetDbSelect,
          targetFkFields,
          targetScalars,
        );

        const uniqueParentTuples = uniqueTuplesFrom(entities, sourcePkFields);

        let related: any[] = [];
        if (uniqueParentTuples.length) {
          onQuery();
          related = await target.repository.getMany({
            where: mergeWhereWithFk(
              whereFromTuples(targetFkFields, uniqueParentTuples),
              nestedWhere,
            ),
            select: targetDbSelect,
            orderBy: nestedOrderBy,
            setCache: opts.setCache,
            tx: opts.tx,
          });

          if (Object.keys(targetRelations).length > 0) {
            await this.composeLevel(
              related,
              targetRelations,
              targetModel,
              depth + 1,
              opts,
              onQuery,
            );
          }
        }

        const entityMap = new Map<string, any>();
        for (const e of related) {
          const key = compositeKey(targetFkFields.map((f) => e[f]));
          if (!key || entityMap.has(key)) continue;
          entityMap.set(key, e);
        }

        entities.forEach((e: any) => {
          const key = compositeKey(sourcePkFields.map((f) => e[f]));
          const hit = entityMap.get(key);
          e[relKey] = hit ? cloneAttachedRow(hit) : null;
        });
      } else {
        // To-many
        const targetFkFields =
          relMeta?.targetFkFields?.length
            ? [...relMeta.targetFkFields]
            : relMeta?.targetFk
              ? [relMeta.targetFk]
              : [`${sourceModel}Id`];

        this.assertTargetFkFields(
          sourceModel,
          relKey,
          targetModel,
          targetFkFields,
          targetScalars,
        );

        targetDbSelect = ensureSelectFields(
          targetDbSelect,
          targetFkFields,
          targetScalars,
        );

        const uniqueParentTuples = uniqueTuplesFrom(entities, sourcePkFields);

        let related: any[] = [];
        if (uniqueParentTuples.length) {
          onQuery();
          related = await target.repository.getMany({
            where: mergeWhereWithFk(
              whereFromTuples(targetFkFields, uniqueParentTuples),
              nestedWhere,
            ),
            select: targetDbSelect,
            orderBy: nestedOrderBy,
            setCache: opts.setCache,
            tx: opts.tx,
          });

          if (Object.keys(targetRelations).length > 0) {
            await this.composeLevel(
              related,
              targetRelations,
              targetModel,
              depth + 1,
              opts,
              onQuery,
            );
          }
        }

        // Preserve getMany orderBy within each parent group, then take
        const entityMap = new Map<string, any[]>();
        for (const e of related) {
          const key = compositeKey(targetFkFields.map((f) => e[f]));
          if (!key || key === String(undefined)) continue;
          const list = entityMap.get(key) ?? [];
          list.push(e);
          entityMap.set(key, list);
        }

        entities.forEach((e: any) => {
          const key = compositeKey(sourcePkFields.map((f) => e[f]));
          let list = entityMap.get(key) ?? [];
          if (typeof nestedTake === 'number' && nestedTake >= 0) {
            list = list.slice(0, nestedTake);
          }
          // Clone rows + new array so parents never share mutable lists/rows
          e[relKey] = list.map((row) => cloneAttachedRow(row));
        });
      }
    };

    if (opts.parallel) {
      await Promise.all(relKeys.map((k) => runOne(k)));
    } else {
      for (const k of relKeys) {
        await runOne(k);
      }
    }
  }

  private assertTargetFkFields(
    sourceModel: string,
    relKey: string,
    targetModel: string,
    targetFkFields: string[],
    targetScalars?: Record<string, string>,
  ): void {
    if (!targetScalars) return;
    const missing = targetFkFields.filter((f) => !(f in targetScalars));
    if (missing.length === 0) return;
    throw new Error(
      `[AutoComposer] Cannot resolve FK for "${sourceModel}.${relKey}" → "${targetModel}". ` +
        `Expected target field(s) [${missing.join(', ')}] but they are not scalars on "${targetModel}". ` +
        `Load Prisma meta via schemaPath / dmmf (loadPrismaMetaFromDmmf or loadPrismaMetaFromSchema).`,
    );
  }
}
