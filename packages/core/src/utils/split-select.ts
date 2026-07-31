export function splitSelect<T extends object>(
  select: T,
  scalarFieldEnum: Record<string, string>,
) {
  const dbSelect: Record<string, unknown> = {};
  const relations: Record<string, unknown> = {};
  const scalarFields = new Set(Object.keys(scalarFieldEnum));

  for (const [key, value] of Object.entries(select)) {
    if (value && typeof value === 'object') {
      relations[key] = value;
      const foreignKey = `${key}Id`;
      if (scalarFields.has(foreignKey)) {
        dbSelect[foreignKey] = true;
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
