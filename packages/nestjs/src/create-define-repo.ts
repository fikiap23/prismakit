import type {
  CamelToPascal,
  HasCacheFromOptions,
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
 * When `cache` is set on options, the returned API includes `setCache` /
 * `cacheTags` / invalidation fields; otherwise those fields are omitted from types.
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
 *   cache: { ttl: 86400 },
 * });
 * export type UserRepository = InstanceType<typeof UserRepository>;
 */
export function createDefineRepo<TTypeMap extends PrismaTypeMapLike>() {
  return function defineRepo<
    const TModelKey extends string,
    const O extends RuntimeRepoOptions & { model: TModelKey },
    TPrismaModel extends CamelToPascal<TModelKey> &
      keyof TTypeMap['model'] = CamelToPascal<TModelKey> &
      keyof TTypeMap['model'],
  >(
    options: O,
  ): new (
    ...args: never[]
  ) => RepositoryApiFromTypeMap<
    TTypeMap,
    TPrismaModel,
    HasCacheFromOptions<O>
  > {
    return createInjectableRepository(options) as new (
      ...args: never[]
    ) => RepositoryApiFromTypeMap<
      TTypeMap,
      TPrismaModel,
      HasCacheFromOptions<O>
    >;
  };
}
