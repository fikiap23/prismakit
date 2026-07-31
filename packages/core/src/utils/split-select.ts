/**
 * Split a Prisma `select` into scalar DB select vs relation keys for AutoComposer.
 *
 * When `relationLocalFks` is provided (from Prisma meta), those FK fields are
 * injected. Otherwise falls back to `${relationKey}Id` when present in scalars.
 */
export function splitSelect<T extends object>(
  select: T,
  scalarFieldEnum: Record<string, string>,
  relationLocalFks?: Record<string, readonly string[]>,
) {
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

  return {
    dbSelect: dbSelect as T,
    relations,
  };
}
