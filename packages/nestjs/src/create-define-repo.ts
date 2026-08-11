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
  /** Override PK. Defaults to schema/`@@id` (composite `string[]`) or `id`. */
  primaryKey?: string | string[];
  cache?: RepositoryOptions['cache'];
  lock?: RepositoryOptions['lock'];
  schemaPath?: string;
};

/** Constructor returned by `defineRepo` / `defineAppRepo`. */
export type InjectableRepo<I> = new (...args: never[]) => I;

type RepoApi<TTypeMap extends PrismaTypeMapLike, O extends RuntimeRepoOptions> =
  RepositoryApiFromTypeMap<
    TTypeMap,
    CamelToPascal<O['model']> & keyof TTypeMap['model'],
    HasCacheFromOptions<O>
  >;

/**
 * Bind your app's `Prisma.TypeMap` once, then define repositories with only
 * runtime options — no select/create/payload phantoms.
 *
 * When `cache` is set on options, the returned API includes `setCache` /
 * `cacheTags` / invalidation fields; otherwise those fields are omitted from types.
 *
 * @example
 * export const defineRepo = createDefineRepo<Prisma.TypeMap>();
 *
 * export class UserRepository extends defineRepo({
 *   model: 'user',
 *   scalarFields: Prisma.UserScalarFieldEnum,
 *   cache: { ttl: 86400 },
 * }) {}
 */
export function createDefineRepo<TTypeMap extends PrismaTypeMapLike>() {
  return function defineRepo<const O extends RuntimeRepoOptions>(
    options: O,
  ): InjectableRepo<RepoApi<TTypeMap, O>> {
    return createInjectableRepository(options) as InjectableRepo<
      RepoApi<TTypeMap, O>
    >;
  };
}
