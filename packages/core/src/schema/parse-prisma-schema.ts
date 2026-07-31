import * as fs from 'fs';
import * as path from 'path';

export type SchemaFieldKind = 'scalar' | 'relation' | 'enum';

export type SchemaField = {
  name: string;
  typeName: string;
  dbName?: string;
  kind: SchemaFieldKind;
  isList: boolean;
};

export type SchemaModel = {
  name: string;
  dbName?: string;
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
    const fields: SchemaField[] = [];

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

      let kind: SchemaFieldKind = 'scalar';
      if (modelNames.has(typeName)) {
        kind = 'relation';
      } else if (enumNames.has(typeName)) {
        kind = 'enum';
      } else if (!PRISMA_SCALAR_TYPES.has(typeName)) {
        continue;
      }

      fields.push({
        name,
        typeName,
        dbName: dbMap?.[1],
        kind,
        isList,
      });
    }

    models.push({
      name: modelName,
      dbName: tableMap?.[1],
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
