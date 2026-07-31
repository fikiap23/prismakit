import type {
  CamelToPascal,
  PrismaTypeMapLike,
  RepositoryApiFromTypeMap,
  RepositoryOptions,
} from '@prismakit/core';

import { createInjectableRepository } from './injectable-repository';

type RuntimeRepoOptions = {
  model: string;
  scalarFields?: Record<string, string>;
  primaryKey?: string;
  cache?: RepositoryOptions['cache'];
  lock?: RepositoryOptions['lock'];
  schemaPath?: string;
};

/**
 * Bind your app's `Prisma.TypeMap` once, then define repositories with only
 * runtime options — no select/create/payload phantoms.
 *
 * @example
 * // infrastructure/prisma/define-app-repo.ts
 * import { createDefineRepo } from '@prismakit/nestjs';
 * import type { Prisma } from './prisma-client';
 * export const defineAppRepo = createDefineRepo<Prisma.TypeMap>();
 *
 * // modules/audit/repositories/audit-log.repository.ts
 * export const AuditLogRepository = defineAppRepo({
 *   model: 'auditLog',
 *   scalarFields: Prisma.AuditLogScalarFieldEnum,
 * });
 * export type AuditLogRepository = InstanceType<typeof AuditLogRepository>;
 */
export function createDefineRepo<TTypeMap extends PrismaTypeMapLike>() {
  return function defineAppRepo<
    const TModelKey extends string,
    TPrismaModel extends CamelToPascal<TModelKey> &
      keyof TTypeMap['model'] = CamelToPascal<TModelKey> &
      keyof TTypeMap['model'],
  >(
    options: RuntimeRepoOptions & { model: TModelKey },
  ): new (
    ...args: never[]
  ) => RepositoryApiFromTypeMap<TTypeMap, TPrismaModel> {
    return createInjectableRepository(options) as new (
      ...args: never[]
    ) => RepositoryApiFromTypeMap<TTypeMap, TPrismaModel>;
  };
}
