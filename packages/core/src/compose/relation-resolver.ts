import { RepositoryRegistry } from '../repository-registry';
import { getModelMeta, getPrismaMeta } from '../schema/prisma-meta';

/**
 * Resolves a Prisma relation field to a registered repository model key
 * using source-scoped schema / DMMF meta.
 *
 * Throws if meta is not loaded, the relation is absent on the source model,
 * or the target model has no registered repository.
 */
export function resolveRelationModel(
  relKey: string,
  registry: RepositoryRegistry,
  sourceModel: string,
): string {
  const meta = getPrismaMeta();
  if (!meta) {
    throw new Error(
      `[PrismaKit] Cannot resolve relation "${sourceModel}.${relKey}": Prisma schema meta is not loaded. ` +
        `Pass schemaPath (default prisma/schema.prisma) or dmmf to PrismaKitModule, ` +
        `or call loadPrismaMetaFromSchema / loadPrismaMetaFromDmmf.`,
    );
  }

  const modelMeta = getModelMeta(sourceModel);
  if (!modelMeta) {
    throw new Error(
      `[PrismaKit] Cannot resolve relation "${sourceModel}.${relKey}": ` +
        `model "${sourceModel}" is not in Prisma schema meta.`,
    );
  }

  const relation = modelMeta.relations[relKey];
  if (!relation) {
    const known = Object.keys(modelMeta.relations);
    throw new Error(
      `[PrismaKit] Relation "${relKey}" is not on schema model "${sourceModel}". ` +
        `Known relations: [${known.join(', ') || 'none'}].`,
    );
  }

  const target = relation.targetModel;
  if (registry.get(target)) {
    return target;
  }

  throw new Error(
    `[PrismaKit] Relation "${sourceModel}.${relKey}" maps to model "${target}" ` +
      `but no repository is registered for "${target}". ` +
      `Define a repository with model: '${target}' or enable autoRegisterModels.`,
  );
}
