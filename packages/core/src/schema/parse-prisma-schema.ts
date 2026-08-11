import * as fs from 'fs';
import * as path from 'path';

export type SchemaFieldKind = 'scalar' | 'relation' | 'enum';

export type SchemaField = {
  name: string;
  typeName: string;
  dbName?: string;
  kind: SchemaFieldKind;
  isList: boolean;
  isId?: boolean;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
};

export type SchemaModel = {
  name: string;
  dbName?: string;
  /** `@id` field, single-field `@@id`, or composite `@@id` columns. */
  primaryKey?: string | string[];
  fields: SchemaField[];
};

const PRISMA_SCALAR_TYPES = new Set([
  'String',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
]);

export function pascalToRepoKey(pascal: string): string {
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function parseStringList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = [...raw.matchAll(/"([^"]+)"|(\w+)/g)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);
  return items.length ? items : undefined;
}

function parseRelationAttrs(trimmed: string): {
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
} {
  const relMatch = trimmed.match(/@relation\(([^)]*)\)/);
  if (!relMatch) return {};

  const args = relMatch[1];
  const nameMatch = args.match(/^\s*"([^"]+)"/) || args.match(/name:\s*"([^"]+)"/);
  const fieldsMatch = args.match(/fields:\s*\[([^\]]*)\]/);
  const refsMatch = args.match(/references:\s*\[([^\]]*)\]/);

  return {
    relationName: nameMatch?.[1],
    relationFromFields: parseStringList(fieldsMatch?.[1]),
    relationToFields: parseStringList(refsMatch?.[1]),
  };
}

export function parsePrismaSchema(schemaPath: string): SchemaModel[] {
  const content = fs.readFileSync(schemaPath, 'utf-8');
  const modelNames = new Set<string>();
  const enumNames = new Set<string>();

  for (const match of content.matchAll(/enum\s+(\w+)\s*\{/g)) {
    enumNames.add(match[1]);
  }
  for (const match of content.matchAll(/model\s+(\w+)\s*\{/g)) {
    modelNames.add(match[1]);
  }

  const models: SchemaModel[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

  for (const match of content.matchAll(modelRegex)) {
    const modelName = match[1];
    const body = match[2];
    const tableMap = body.match(/@@map\("([^"]+)"\)/);
    const compoundId = body.match(/@@id\(\[([^\]]*)\]\)/);
    const fields: SchemaField[] = [];
    let primaryKey: string | string[] | undefined;

    if (compoundId) {
      const ids = parseStringList(compoundId[1]);
      if (ids?.length === 1) primaryKey = ids[0];
      else if (ids && ids.length > 1) primaryKey = ids;
    }

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('@@') ||
        trimmed.startsWith('@')
      ) {
        continue;
      }

      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!fieldMatch) continue;

      const [, name, typeName, listMarker] = fieldMatch;
      const dbMap = trimmed.match(/@map\("([^"]+)"\)/);
      const isList = listMarker === '[]';
      const hasIdAttr = /(?:^|[^\w])@id(?:\b|\()/.test(trimmed);

      let kind: SchemaFieldKind = 'scalar';
      if (modelNames.has(typeName)) {
        kind = 'relation';
      } else if (enumNames.has(typeName)) {
        kind = 'enum';
      } else if (!PRISMA_SCALAR_TYPES.has(typeName)) {
        continue;
      }

      const relationAttrs =
        kind === 'relation' ? parseRelationAttrs(trimmed) : {};

      if (hasIdAttr) {
        primaryKey = name;
      }

      fields.push({
        name,
        typeName,
        dbName: dbMap?.[1],
        kind,
        isList,
        isId: hasIdAttr || undefined,
        ...relationAttrs,
      });
    }

    models.push({
      name: modelName,
      dbName: tableMap?.[1],
      primaryKey,
      fields,
    });
  }

  return models;
}

export function getSchemaModels(schemaPath?: string): SchemaModel[] {
  const resolved =
    schemaPath ?? path.join(process.cwd(), 'prisma', 'schema.prisma');
  return parsePrismaSchema(resolved);
}

export function findModelByTableName(
  tableName: string,
  schemaPath?: string,
): SchemaModel | undefined {
  return getSchemaModels(schemaPath).find((model) => {
    const mappedTable = model.dbName ?? model.name;
    return mappedTable === tableName;
  });
}

export function findModelByName(
  modelNameOrClientKey: string,
  schemaPath?: string,
): SchemaModel | undefined {
  const models = getSchemaModels(schemaPath);
  const exact = models.find((m) => m.name === modelNameOrClientKey);
  if (exact) return exact;
  return models.find((m) => pascalToRepoKey(m.name) === modelNameOrClientKey);
}

export function getScalarFields(model: SchemaModel): SchemaField[] {
  return model.fields.filter(
    (field) => field.kind === 'scalar' || field.kind === 'enum',
  );
}

export function getRelationFields(model: SchemaModel): SchemaField[] {
  return model.fields.filter((field) => field.kind === 'relation');
}

export function expectedDbColumn(field: SchemaField): string {
  return field.dbName ?? field.name;
}
