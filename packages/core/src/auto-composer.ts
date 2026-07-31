import { splitSelect } from './utils/split-select';
import { RepositoryRegistry } from './repository-registry';
import { resolveRelationModel } from './compose/relation-resolver';

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
    const sourceScalarFields = source?.scalarFields ?? {};

    await Promise.all(
      Object.keys(relations).map(async (relKey) => {
        const targetModel = resolveRelationModel(relKey, this.registry);
        const target = this.registry.getOrThrow(targetModel);
        const relationSelect = relations[relKey];

        let targetDbSelect: Record<string, any> | undefined =
          relationSelect === true
            ? undefined
            : relationSelect.select || relationSelect;
        let targetRelations: Record<string, any> = {};

        if (target.scalarFields && targetDbSelect) {
          const split = splitSelect(targetDbSelect, target.scalarFields);
          targetDbSelect = split.dbSelect as Record<string, any>;
          targetRelations = split.relations;
        }

        const foreignKey = `${relKey}Id`;
        const isOne = foreignKey in sourceScalarFields;

        if (isOne) {
          const ids = [
            ...new Set(
              entities
                .map((e) => e[foreignKey])
                .filter((id): id is string => !!id),
            ),
          ];

          let related: any[] = [];
          if (ids.length) {
            related = await target.repository.getMany({
              where: { id: { in: ids } },
              select: targetDbSelect,
              setCache: true,
            });

            if (Object.keys(targetRelations).length > 0) {
              await this.composeMany(related, targetRelations, targetModel);
            }
          }

          const entityMap = new Map(related.map((e) => [e.id, e]));
          entities.forEach((e: any) => {
            e[relKey] = e[foreignKey]
              ? (entityMap.get(e[foreignKey]) ?? null)
              : null;
          });
        } else {
          // to-many: child rows are keyed by `${sourceModel}Id` (e.g. categoryId).
          // Always select that FK so we can group rows back onto parents —
          // otherwise related fetches succeed but attach as [].
          const targetFk = `${sourceModel}Id`;
          if (
            targetDbSelect &&
            target.scalarFields &&
            targetFk in target.scalarFields
          ) {
            targetDbSelect = { ...targetDbSelect, [targetFk]: true };
          }

          const parentIds = entities.map((e) => e.id);

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
            e[relKey] = entityMap.get(e.id) ?? [];
          });
        }
      }),
    );

    return entities;
  }
}
