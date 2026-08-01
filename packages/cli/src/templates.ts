import type { ModuleNames } from './naming';

export type GenerateOptions = {
  names: ModuleNames;
  cacheEnabled: boolean;
  /** When false (default), only emit the repository file. */
  full?: boolean;
  /** Emit validate + mapper helpers. */
  helpers?: boolean;
  /** Emit class-validator DTOs with @ApiProperty. */
  dto?: boolean;
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
    defaultSetCache: true,
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
  const { names, cacheEnabled, full = false, helpers = false, dto = false } =
    options;
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
import { where{{pascal}}GetManyPaginate } from '../types/where-{{kebab}}.type';
{{dtoImport}}
@Injectable()
export class {{pascal}}Service {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async handleCreate(dto: Create{{pascal}}Dto) {
    return await this.{{camel}}Repository.create({
      data: { ...dto },
      select: get{{pascal}}Select('general'),
    });
  }

  async handleGetById(id: string) {
    return await this.{{camel}}Repository.getThrowById({
      id,
      select: get{{pascal}}Select('general'),
      setCache: true,
    });
  }

  async handleGetManyPaginate(filter: Filter{{pascal}}Dto) {
    const { where } = where{{pascal}}GetManyPaginate(filter);
    return await this.{{camel}}Repository.getManyPaginate({
      where,
      select: get{{pascal}}Select('general'),
      page: filter.page,
      pageSize: filter.pageSize,
      setCache: true,
    });
  }

  async handleUpdateById(id: string, dto: Update{{pascal}}Dto) {
    return await this.{{camel}}Repository.updateById({
      id,
      data: { ...dto },
      select: get{{pascal}}Select('general'),
    });
  }

  async handleDeleteById(id: string) {
    return await this.{{camel}}Repository.deleteById({
      id,
      select: get{{pascal}}Select('minimal'),
    });
  }
}
`,
    names,
    {
      '{{dtoImport}}': dto
        ? `import type {\n  Create{{pascal}}Dto,\n  Update{{pascal}}Dto,\n  Filter{{pascal}}Dto,\n} from '../dto/{{kebab}}.dto';\n`
        : `type Create{{pascal}}Dto = Record<string, unknown>;\ntype Update{{pascal}}Dto = Record<string, unknown>;\ntype Filter{{pascal}}Dto = { page?: number; pageSize?: number; q?: string };\n`,
    },
  );

  const controller = apply(
    `import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { {{pascal}}Service } from '../services/{{kebab}}.service';
{{dtoImport}}
@Controller('{{route}}')
export class {{pascal}}Controller {
  constructor(private readonly {{camel}}Service: {{pascal}}Service) {}

  @Post()
  async create(@Body() dto: Create{{pascal}}Dto, @Res() res: Response) {
    try {
      const result = await this.{{camel}}Service.handleCreate(dto);
      return res.status(HttpStatus.CREATED).json({ data: result });
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode ?? 500;
      return res.status(status).json({
        error: { message: (error as Error).message, httpStatus: status },
      });
    }
  }

  @Get()
  async getMany(@Query() filter: Filter{{pascal}}Dto, @Res() res: Response) {
    try {
      const result = await this.{{camel}}Service.handleGetManyPaginate(filter);
      return res.status(HttpStatus.OK).json({ data: result.data, meta: result.meta });
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode ?? 500;
      return res.status(status).json({
        error: { message: (error as Error).message, httpStatus: status },
      });
    }
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.{{camel}}Service.handleGetById(id);
      return res.status(HttpStatus.OK).json({ data: result });
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode ?? 500;
      return res.status(status).json({
        error: { message: (error as Error).message, httpStatus: status },
      });
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: Update{{pascal}}Dto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.{{camel}}Service.handleUpdateById(id, dto);
      return res.status(HttpStatus.OK).json({ data: result });
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode ?? 500;
      return res.status(status).json({
        error: { message: (error as Error).message, httpStatus: status },
      });
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.{{camel}}Service.handleDeleteById(id);
      return res.status(HttpStatus.OK).json({ data: result });
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode ?? 500;
      return res.status(status).json({
        error: { message: (error as Error).message, httpStatus: status },
      });
    }
  }
}
`,
    names,
    {
      '{{dtoImport}}': dto
        ? `import type {\n  Create{{pascal}}Dto,\n  Update{{pascal}}Dto,\n  Filter{{pascal}}Dto,\n} from '../dto/{{kebab}}.dto';\n`
        : `type Create{{pascal}}Dto = Record<string, unknown>;\ntype Update{{pascal}}Dto = Record<string, unknown>;\ntype Filter{{pascal}}Dto = { page?: number; pageSize?: number; q?: string };\n`,
    },
  );

  const moduleFile = apply(
    `import { Module } from '@nestjs/common';

import { {{pascal}}Controller } from './controllers/{{kebab}}.controller';
import { {{pascal}}Service } from './services/{{kebab}}.service';
import { {{pascal}}Repository } from './repositories/{{kebab}}.repository';
{{helpersImport}}
@Module({
  controllers: [{{pascal}}Controller],
  providers: [{{pascal}}Service, {{pascal}}Repository{{helpersProviders}}],
  exports: [{{pascal}}Service, {{pascal}}Repository],
})
export class {{pascal}}Module {}
`,
    names,
    {
      '{{helpersImport}}': helpers
        ? `import { {{pascal}}ValidateHelper } from './helpers/{{kebab}}-validate.helper';\nimport { {{pascal}}MapperHelper } from './helpers/{{kebab}}-mapper.helper';\n`
        : '',
      '{{helpersProviders}}': helpers
        ? `, {{pascal}}ValidateHelper, {{pascal}}MapperHelper`
        : '',
    },
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

export function where{{pascal}}GetManyPaginate(filter: {
  q?: string;
}): {
  where: Prisma.{{pascal}}WhereInput;
} {
  const { q } = filter;
  const where: Prisma.{{pascal}}WhereInput = {
    ...(q ? { /* add searchable fields */ } : {}),
  };
  return { where };
}
`,
    names,
    { '{{prismaImport}}': prismaImport },
  );

  const files: GeneratedFile[] = [
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

  if (dto) {
    files.push({
      relativePath: `${base}/dto/${names.kebab}.dto.ts`,
      content: apply(
        `import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class Create{{pascal}}Dto {
  @ApiProperty({ example: 'name' })
  @IsString()
  name!: string;
}

export class Update{{pascal}}Dto {
  @ApiPropertyOptional({ example: 'name' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class Filter{{pascal}}Dto {
  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}
`,
        names,
        {},
      ),
    });
  }

  if (helpers) {
    files.push(
      {
        relativePath: `${base}/helpers/${names.kebab}-validate.helper.ts`,
        content: apply(
          `import { Injectable } from '@nestjs/common';

import { {{pascal}}Repository } from '../repositories/{{kebab}}.repository';
import { get{{pascal}}Select } from '../types/select-{{kebab}}.type';

@Injectable()
export class {{pascal}}ValidateHelper {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async assertExists(id: string) {
    return this.{{camel}}Repository.getThrowById({
      id,
      select: get{{pascal}}Select('minimal'),
    });
  }
}
`,
          names,
          {},
        ),
      },
      {
        relativePath: `${base}/helpers/${names.kebab}-mapper.helper.ts`,
        content: apply(
          `import { Injectable } from '@nestjs/common';

@Injectable()
export class {{pascal}}MapperHelper {
  toResponse(entity: Record<string, unknown>) {
    return entity;
  }
}
`,
          names,
          {},
        ),
      },
    );
  }

  return files;
}
