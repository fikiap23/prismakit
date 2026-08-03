/**
 * Split a Prisma `select` into scalar DB select vs relation keys for AutoComposer.
 *
 * When `relationLocalFks` is provided (from Prisma meta), those FK fields are
 * injected. Otherwise falls back to `${relationKey}Id` when present in scalars.
 *
 * Results are cached by select object identity × scalarFieldEnum identity
 * (WeakMap) so shared select presets across models do not collide.
 */

type SplitResult<T> = {
  dbSelect: T;
  relations: Record<string, unknown>;
};

const splitCache = new WeakMap<object, WeakMap<object, SplitResult<object>>>();

export function splitSelect<T extends object>(
  select: T,
  scalarFieldEnum: Record<string, string>,
  relationLocalFks?: Record<string, readonly string[]>,
): SplitResult<T> {
  if (!relationLocalFks) {
    const byScalars = splitCache.get(select);
    const cached = byScalars?.get(scalarFieldEnum);
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
    let byScalars = splitCache.get(select);
    if (!byScalars) {
      byScalars = new WeakMap();
      splitCache.set(select, byScalars);
    }
    byScalars.set(scalarFieldEnum, result as SplitResult<object>);
  }

  return result;
}

/** Clear splitSelect WeakMap (for tests). */
export function clearSplitSelectCache(): void {
  // WeakMap has no clear — no-op; entries GC with select objects.
}
