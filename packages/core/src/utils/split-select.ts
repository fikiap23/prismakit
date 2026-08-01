/**
 * Split a Prisma `select` into scalar DB select vs relation keys for AutoComposer.
 *
 * When `relationLocalFks` is provided (from Prisma meta), those FK fields are
 * injected. Otherwise falls back to `${relationKey}Id` when present in scalars.
 *
 * Results are cached by select object identity (WeakMap) when no relationLocalFks
 * override is needed for a different identity — callers with stable select presets
 * benefit from zero re-split cost.
 */

type SplitResult<T> = {
  dbSelect: T;
  relations: Record<string, unknown>;
};

const splitCache = new WeakMap<object, SplitResult<object>>();

export function splitSelect<T extends object>(
  select: T,
  scalarFieldEnum: Record<string, string>,
  relationLocalFks?: Record<string, readonly string[]>,
): SplitResult<T> {
  // Only cache when FKs come from a stable source keyed with the select object.
  // When relationLocalFks is provided, still cache by select identity (FKs are
  // typically stable per model for the lifetime of the process).
  if (!relationLocalFks) {
    const cached = splitCache.get(select);
    if (cached) return cached as SplitResult<T>;
  }

  const dbSelect: Record<string, unknown> = {};
  const relations: Record<string, unknown> = {};
  const scalarFields = new Set(Object.keys(scalarFieldEnum));

  for (const [key, value] of Object.entries(select)) {
    // Prisma aggregation selects (e.g. `_count`) must stay on the DB query —
    // they are not relations for AutoComposer.
    if (key === '_count') {
      dbSelect[key] = value;
      continue;
    }
    if (value && typeof value === 'object') {
      relations[key] = value;
      const metaFks = relationLocalFks?.[key];
      if (metaFks && metaFks.length > 0) {
        for (const fk of metaFks) {
          if (scalarFields.has(fk)) {
            dbSelect[fk] = true;
          }
        }
      } else {
        const foreignKey = `${key}Id`;
        if (scalarFields.has(foreignKey)) {
          dbSelect[foreignKey] = true;
        }
      }
    } else {
      dbSelect[key] = value;
    }
  }

  const result = {
    dbSelect: dbSelect as T,
    relations,
  };

  if (!relationLocalFks) {
    splitCache.set(select, result as SplitResult<object>);
  }

  return result;
}

/** Clear splitSelect WeakMap (for tests). */
export function clearSplitSelectCache(): void {
  // WeakMap has no clear — no-op; entries GC with select objects.
}
