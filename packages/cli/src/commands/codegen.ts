import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  computeRelationAliasesFromSchema,
  getSchemaModels,
} from '@prismakit/core';

export type CodegenCommandOptions = {
  cwd?: string;
  schemaPath?: string;
  write?: boolean;
  outFile?: string;
};

/**
 * Parse prisma/schema.prisma and print (or write) suggested relation aliases.
 */
export function runCodegen(options: CodegenCommandOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();
  const schemaPath =
    options.schemaPath ?? path.join(cwd, 'prisma', 'schema.prisma');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Prisma schema not found at ${schemaPath}`);
  }

  const models = getSchemaModels(schemaPath);
  const aliases = computeRelationAliasesFromSchema(models);

  const entries = Object.entries(aliases).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (entries.length === 0) {
    console.log(
      'No additional relation aliases suggested (suffix rules cover all).',
    );
    return;
  }

  const lines = [
    '// Suggested RELATION_MODEL_ALIASES entries (merge into your resolver config)',
    'export const SUGGESTED_RELATION_MODEL_ALIASES = {',
    ...entries.map(([k, v]) => `  ${k}: '${v}',`),
    '} as const;',
    '',
  ];
  const output = lines.join('\n');

  if (options.write) {
    const out =
      options.outFile ??
      path.join(
        cwd,
        'src',
        'infrastructure',
        'prisma',
        'suggested-relation-aliases.ts',
      );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, output, 'utf-8');
    console.log(`wrote ${path.relative(cwd, out)}`);
  } else {
    console.log(output);
  }

  console.log(`\n${entries.length} alias suggestion(s).`);
}
