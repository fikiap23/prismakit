import { splitSelect } from './utils/split-select';
import { RepositoryRegistry } from './repository-registry';
import { resolveRelationModel } from './compose/relation-resolver';
import { getModelMeta } from './schema/prisma-meta';

export class AutoComposer {
  constructor(private readonly registry: RepositoryRegistry) {}

  async composeOne<T extends Record<string, any>>(
    entity: T,
    relations: Record<string, any> = {},
    sourceModel: string,
  ): Promise<any> {
    if (!entity) return null;
    const [composed] = await this.composeMany([entity], relations, sourceModel);
    return composed;
  }

  async composeMany<T extends Record<string, any>>(
    entities: T[],
    relations: Record<string, any> = {},
    sourceModel: string,
  ): Promise<any[]> {
    if (!entities.length || !Object.keys(relations).length) {
      return entities;
    }

    const source = this.registry.get(sourceModel);
    const sourceMeta = getModelMeta(sourceModel);
    const sourceScalarFields = source?.scalarFields ?? sourceMeta?.scalarFields ?? {};
    const sourcePk = sourceMeta?.primaryKey ?? 'id';

    await Promise.all(
      Object.keys(relations).map(async (relKey) => {
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

        const targetScalars =
          target.scalarFields ?? targetMeta?.scalarFields;
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

        const localFk =
          relMeta?.localFields[0] ??
          (`${relKey}Id` in sourceScalarFields ? `${relKey}Id` : undefined);

        const isOne =
          relMeta?.kind === 'one' || (!relMeta && !!localFk);

        if (isOne) {
          if (!localFk) {
            entities.forEach((e: any) => {
              e[relKey] = null;
            });
            return;
          }
          const fkField = localFk;
          const ids = [
            ...new Set(
              entities
                .map((e) => e[fkField])
                .filter((id): id is string => !!id),
            ),
          ];

          let related: any[] = [];
          if (ids.length) {
            related = await target.repository.getMany({
              where: { [targetPk]: { in: ids } },
              select: targetDbSelect,
              setCache: true,
            });

            if (Object.keys(targetRelations).length > 0) {
              await this.composeMany(related, targetRelations, targetModel);
            }
          }

          const entityMap = new Map(related.map((e) => [e[targetPk], e]));
          entities.forEach((e: any) => {
            e[relKey] = e[fkField]
              ? (entityMap.get(e[fkField]) ?? null)
              : null;
          });
        } else {
          const targetFk =
            relMeta?.targetFk ?? `${sourceModel}Id`;

          if (
            targetDbSelect &&
            targetScalars &&
            targetFk in targetScalars
          ) {
            targetDbSelect = { ...targetDbSelect, [targetFk]: true };
          }

          const parentIds = entities.map((e) => e[sourcePk]);

          let related: any[] = [];
          if (parentIds.length) {
            related = await target.repository.getMany({
              where: { [targetFk]: { in: parentIds } },
              select: targetDbSelect,
              setCache: true,
            });

            if (Object.keys(targetRelations).length > 0) {
              await this.composeMany(related, targetRelations, targetModel);
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
      }),
    );

    return entities;
  }
}
