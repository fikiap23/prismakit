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
 * // src/prisma/define-repo.ts
 * import { createDefineRepo } from '@prismakit/nestjs';
 * import type { Prisma } from '@prisma/client';
 * export const defineRepo = createDefineRepo<Prisma.TypeMap>();
 *
 * // src/users/user.repository.ts
 * export const UserRepository = defineRepo({
 *   model: 'user',
 *   scalarFields: Prisma.UserScalarFieldEnum,
 * });
 * export type UserRepository = InstanceType<typeof UserRepository>;
 */
export function createDefineRepo<TTypeMap extends PrismaTypeMapLike>() {
  return function defineRepo<
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
