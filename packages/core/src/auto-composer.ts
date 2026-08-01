import { splitSelect } from './utils/split-select';
import { RepositoryRegistry } from './repository-registry';
import { resolveRelationModel } from './compose/relation-resolver';
import { getModelMeta } from './schema/prisma-meta';
import {
  getComposeOptions,
  mergeComposeOptions,
  type ComposeOptions,
} from './compose/compose-options';
import { emitTelemetry } from './telemetry/telemetry';

/**
 * Ensure relation target rows include the primary key so AutoComposer can map
 * them back onto parents (and nest further). Callers may omit `id` in nested
 * selects; without this injection every relation attaches as `null`.
 */
export function ensureSelectPrimaryKey(
  select: Record<string, any> | undefined,
  primaryKey: string,
  scalarFields?: Record<string, string>,
): Record<string, any> | undefined {
  if (!select) return select;
  if (scalarFields && !(primaryKey in scalarFields)) return select;
  if (select[primaryKey] === true) return select;
  return { ...select, [primaryKey]: true };
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
    opts: Required<ComposeOptions>,
    onQuery: () => void,
  ): Promise<void> {
    if (!entities.length || !Object.keys(relations).length) return;

    if (depth >= opts.maxDepth) {
      console.warn(
        `[AutoComposer] maxDepth=${opts.maxDepth} reached for model "${sourceModel}" — skipping deeper relations`,
      );
      return;
    }

    const source = this.registry.get(sourceModel);
    const sourceMeta = getModelMeta(sourceModel);
    const sourceScalarFields =
      source?.scalarFields ?? sourceMeta?.scalarFields ?? {};
    const sourcePk = sourceMeta?.primaryKey ?? 'id';

    const relKeys = Object.keys(relations);

    const runOne = async (relKey: string) => {
      const relMeta = sourceMeta?.relations[relKey];
      const targetModel = resolveRelationModel(
        relKey,
        this.registry,
        sourceModel,
      );
      const target = this.registry.getOrThrow(targetModel);
      const targetMeta = getModelMeta(targetModel);
      const targetPk = targetMeta?.primaryKey ?? 'id';
      const relationSelect = relations[relKey];

      let targetDbSelect: Record<string, any> | undefined =
        relationSelect === true
          ? undefined
          : relationSelect.select || relationSelect;
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

      // Preserve where/orderBy/take from Prisma-style nested select args
      const nestedWhere =
        relationSelect &&
        typeof relationSelect === 'object' &&
        relationSelect.where
          ? relationSelect.where
          : undefined;
      const nestedOrderBy =
        relationSelect &&
        typeof relationSelect === 'object' &&
        relationSelect.orderBy
          ? relationSelect.orderBy
          : undefined;
      const nestedTake =
        relationSelect &&
        typeof relationSelect === 'object' &&
        typeof relationSelect.take === 'number'
          ? relationSelect.take
          : undefined;

      const localFk =
        relMeta?.localFields[0] ??
        (`${relKey}Id` in sourceScalarFields ? `${relKey}Id` : undefined);

      const isOne = relMeta?.kind === 'one' || (!relMeta && !!localFk);

      if (isOne && localFk) {
        const fkField = localFk;
        const ids = [
          ...new Set(
            entities.map((e) => e[fkField]).filter((id): id is string => !!id),
          ),
        ];

        let related: any[] = [];
        if (ids.length) {
          onQuery();
          related = await target.repository.getMany({
            where: { [targetPk]: { in: ids } },
            select: targetDbSelect,
            setCache: opts.setCache,
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

        const entityMap = new Map(related.map((e) => [e[targetPk], e]));
        entities.forEach((e: any) => {
          e[relKey] = e[fkField] ? (entityMap.get(e[fkField]) ?? null) : null;
        });
      } else if (isOne && !localFk) {
        // Reverse 1:1 — FK lives on the target model (e.g. Sparepart.sourceUsagePartId).
        const targetFk = relMeta?.targetFk ?? `${sourceModel}Id`;

        if (!targetFk) {
          entities.forEach((e: any) => {
            e[relKey] = null;
          });
          return;
        }

        if (targetDbSelect && targetScalars && targetFk in targetScalars) {
          targetDbSelect = { ...targetDbSelect, [targetFk]: true };
        }

        const parentIds = entities.map((e) => e[sourcePk]);

        let related: any[] = [];
        if (parentIds.length) {
          onQuery();
          related = await target.repository.getMany({
            where: {
              [targetFk]: { in: parentIds },
              ...(nestedWhere ?? {}),
            },
            select: targetDbSelect,
            orderBy: nestedOrderBy,
            take: nestedTake,
            setCache: opts.setCache,
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
          const fkValue = e[targetFk];
          if (!fkValue || entityMap.has(fkValue)) continue;
          entityMap.set(fkValue, e);
        }

        entities.forEach((e: any) => {
          e[relKey] = entityMap.get(e[sourcePk]) ?? null;
        });
      } else {
        const targetFk = relMeta?.targetFk ?? `${sourceModel}Id`;

        if (targetDbSelect && targetScalars && targetFk in targetScalars) {
          targetDbSelect = { ...targetDbSelect, [targetFk]: true };
        }

        const parentIds = entities.map((e) => e[sourcePk]);

        let related: any[] = [];
        if (parentIds.length) {
          onQuery();
          related = await target.repository.getMany({
            where: {
              [targetFk]: { in: parentIds },
              ...(nestedWhere ?? {}),
            },
            select: targetDbSelect,
            orderBy: nestedOrderBy,
            take: nestedTake,
            setCache: opts.setCache,
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

        const entityMap = new Map<string, any[]>();
        for (const e of related) {
          const fkValue = e[targetFk];
          if (!fkValue) continue;
          const list = entityMap.get(fkValue) ?? [];
          list.push(e);
          entityMap.set(fkValue, list);
        }

        entities.forEach((e: any) => {
          e[relKey] = entityMap.get(e[sourcePk]) ?? [];
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
}

/** @deprecated Prefer getComposeOptions / setComposeOptions */
export { getComposeOptions };
