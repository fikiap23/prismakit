import type { ModuleNames } from './naming';

export type GenerateOptions = {
  names: ModuleNames;
  cacheEnabled: boolean;
  /** When false (default), only emit the repository file. */
  full?: boolean;
  /** Prisma client import path (default `@prisma/client`). */
  prismaImport?: string;
};

function apply(template: string, names: ModuleNames, extras: Record<string, string>): string {
  const replacements: Record<string, string> = {
    '{{pascal}}': names.pascal,
    '{{camel}}': names.camel,
    '{{kebab}}': names.kebab,
    '{{route}}': names.route,
    '{{repoModel}}': names.repoModel,
    ...extras,
  };
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value);
  }
  return result;
}

export type GeneratedFile = {
  relativePath: string;
  content: string;
};

function renderRepository(
  names: ModuleNames,
  cacheEnabled: boolean,
  prismaImport: string,
  base: string,
): GeneratedFile {
  const cacheBlock = cacheEnabled
    ? `  cache: {
    ttl: 86400,
    sensitiveFields: ['password'],
  },
`
    : '';

  const content = apply(
    `import { Prisma } from '{{prismaImport}}';
import { createInjectableRepository } from '@prismakit/nestjs';

export const {{pascal}}Repository = createInjectableRepository({
  model: '{{repoModel}}',
  scalarFields: Prisma.{{pascal}}ScalarFieldEnum,
{{cacheBlock}}});

export type {{pascal}}Repository = InstanceType<typeof {{pascal}}Repository>;
`,
    names,
    {
      '{{cacheBlock}}': cacheBlock,
      '{{prismaImport}}': prismaImport,
    },
  );

  return {
    relativePath: `${base}/repositories/${names.kebab}.repository.ts`,
    content,
  };
}

export function renderModuleFiles(options: GenerateOptions): GeneratedFile[] {
  const { names, cacheEnabled, full = false } = options;
  const prismaImport = options.prismaImport ?? '@prisma/client';
  const base = `src/modules/${names.kebab}`;

  const repository = renderRepository(names, cacheEnabled, prismaImport, base);

  if (!full) {
    return [repository];
  }

  const service = apply(
    `import { Injectable } from '@nestjs/common';

import { {{pascal}}Repository } from '../repositories/{{kebab}}.repository';
import { get{{pascal}}Select } from '../types/select-{{kebab}}.type';

@Injectable()
export class {{pascal}}Service {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async handleGetById(id: string) {
    return await this.{{camel}}Repository.getThrowById({
      id,
      select: get{{pascal}}Select('general'),
      setCache: true,
    });
  }
}
`,
    names,
    {},
  );

  const controller = apply(
    `import { Controller, Get, Param } from '@nestjs/common';

import { {{pascal}}Service } from '../services/{{kebab}}.service';

@Controller('{{route}}')
export class {{pascal}}Controller {
  constructor(private readonly {{camel}}Service: {{pascal}}Service) {}

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.{{camel}}Service.handleGetById(id);
  }
}
`,
    names,
    {},
  );

  const moduleFile = apply(
    `import { Module } from '@nestjs/common';

import { {{pascal}}Controller } from './controllers/{{kebab}}.controller';
import { {{pascal}}Service } from './services/{{kebab}}.service';
import { {{pascal}}Repository } from './repositories/{{kebab}}.repository';

@Module({
  controllers: [{{pascal}}Controller],
  providers: [{{pascal}}Service, {{pascal}}Repository],
  exports: [{{pascal}}Service, {{pascal}}Repository],
})
export class {{pascal}}Module {}
`,
    names,
    {},
  );

  const select = apply(
    `import { Prisma } from '{{prismaImport}}';

type {{pascal}}SelectPresetKey = keyof typeof {{camel}}SelectPresets;

export function get{{pascal}}Select<K extends {{pascal}}SelectPresetKey>(key: K) {
  return {{camel}}SelectPresets[key];
}

export const {{camel}}SelectPresets = {
  minimal: {
    id: true,
  } satisfies Prisma.{{pascal}}Select,

  general: {
    id: true,
  } satisfies Prisma.{{pascal}}Select,
};
`,
    names,
    { '{{prismaImport}}': prismaImport },
  );

  const where = apply(
    `import { Prisma } from '{{prismaImport}}';

export function where{{pascal}}GetManyPaginate(_filter: {
  q?: string;
}): {
  where: Prisma.{{pascal}}WhereInput;
} {
  return { where: {} };
}
`,
    names,
    { '{{prismaImport}}': prismaImport },
  );

  return [
    { relativePath: `${base}/${names.kebab}.module.ts`, content: moduleFile },
    {
      relativePath: `${base}/controllers/${names.kebab}.controller.ts`,
      content: controller,
    },
    {
      relativePath: `${base}/services/${names.kebab}.service.ts`,
      content: service,
    },
    repository,
    {
      relativePath: `${base}/types/select-${names.kebab}.type.ts`,
      content: select,
    },
    {
      relativePath: `${base}/types/where-${names.kebab}.type.ts`,
      content: where,
    },
  ];
}
