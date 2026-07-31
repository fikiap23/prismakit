import {
  getRelationFields,
  pascalToRepoKey,
  SchemaModel,
} from '../schema/parse-prisma-schema';
import { RELATION_MODEL_SUFFIX_RULES } from './relation-resolver';

export function candidatesWithoutAliases(relKey: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (model: string) => {
    if (seen.has(model)) return;
    seen.add(model);
    candidates.push(model);
  };

  add(relKey);

  for (const { suffix, model } of RELATION_MODEL_SUFFIX_RULES) {
    if (relKey.endsWith(suffix) && relKey !== model) {
      add(model);
    }
  }

  return candidates;
}

/** Relation field names that need explicit aliases (schema → repo key). */
export function computeRelationAliasesFromSchema(
  models: SchemaModel[],
): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const model of models) {
    for (const field of getRelationFields(model)) {
      const targetKey = pascalToRepoKey(field.typeName);
      if (field.name === targetKey) continue;

      const candidates = candidatesWithoutAliases(field.name);
      if (!candidates.includes(targetKey)) {
        aliases[field.name] = targetKey;
      }
    }
  }

  return aliases;
}
