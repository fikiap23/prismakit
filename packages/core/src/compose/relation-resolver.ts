import { RepositoryRegistry } from '../repository-registry';
import { getModelMeta } from '../schema/prisma-meta';

/**
 * Maps Prisma relation **field names** to repository registry `model` keys when they differ.
 *
 * Empty by default — apps inject codegen output via `setRelationModelAliases`.
 * Prefer loading Prisma DMMF via `loadPrismaMetaFromDmmf` so aliases are optional.
 * Consumers may also mutate this object directly.
 */
export let RELATION_MODEL_ALIASES: Record<string, string> = {};

/**
 * Replace the relation-field → registry-model alias map (e.g. from CLI codegen).
 */
export function setRelationModelAliases(
  aliases: Record<string, string>,
): void {
  RELATION_MODEL_ALIASES = { ...aliases };
}

/** Merge aliases into the current map (codegen / app bootstrap). */
export function mergeRelationModelAliases(
  aliases: Record<string, string>,
): void {
  RELATION_MODEL_ALIASES = { ...RELATION_MODEL_ALIASES, ...aliases };
}

export function getRelationModelAliases(): Record<string, string> {
  return { ...RELATION_MODEL_ALIASES };
}

/**
 * Suffix → registry model. Applied when `relKey.endsWith(suffix)` and `relKey !== model`.
 * Empty by default — apps should use Prisma meta / `setRelationModelAliases`.
 */
export const RELATION_MODEL_SUFFIX_RULES: Readonly<
  Array<{ suffix: string; model: string }>
> = [];

/** Ordered candidates for registry lookup (first match wins). */
export function buildRelationModelCandidates(relKey: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (model: string) => {
    if (seen.has(model)) return;
    seen.add(model);
    candidates.push(model);
  };

  add(relKey);

  const alias = RELATION_MODEL_ALIASES[relKey];
  if (alias) add(alias);

  for (const { suffix, model } of RELATION_MODEL_SUFFIX_RULES) {
    if (relKey.endsWith(suffix) && relKey !== model) {
      add(model);
    }
  }

  return candidates;
}

/**
 * Resolves a Prisma relation field to a registered repository model key.
 * Throws if no repository is registered for any candidate.
 *
 * When `sourceModel` is set and Prisma meta is loaded, uses DMMF target first.
 */
export function resolveRelationModel(
  relKey: string,
  registry: RepositoryRegistry,
  sourceModel?: string,
): string {
  if (sourceModel) {
    const fromMeta = getModelMeta(sourceModel)?.relations[relKey]?.targetModel;
    if (fromMeta && registry.get(fromMeta)) {
      return fromMeta;
    }
  }

  for (const model of buildRelationModelCandidates(relKey)) {
    if (registry.get(model)) return model;
  }

  registry.getOrThrow(relKey);
  return relKey;
}
