import type {
  CamelToPascal,
  HasCacheFromOptions,
  PascalToCamel,
  PrismaTypeMapLike,
  RepositoryApiFromTypeMap,
  RepositoryOptions,
  CacheOptions,
} from '@prismakit/core';

import { createInjectableRepository } from './injectable-repository';

/** Model client keys from TypeMap.meta.modelProps, or Pascal→camel fallback. */
export type ModelKeyOf<TTypeMap extends PrismaTypeMapLike> =
  TTypeMap extends { meta: { modelProps: infer M extends string } }
    ? M
    : PascalToCamel<keyof TTypeMap['model'] & string>;

type RuntimeRepoOptions<TModel extends string = string> = {
  model: TModel;
  cache?: RepositoryOptions['cache'];
  lock?: RepositoryOptions['lock'];
};

/** Constructor returned by `defineAppRepo` / the binder from `createDefineRepo`. */
export type InjectableRepo<I> = new (...args: never[]) => I;

type RepoApi<
  TTypeMap extends PrismaTypeMapLike,
  O extends RuntimeRepoOptions,
> = RepositoryApiFromTypeMap<
  TTypeMap,
  CamelToPascal<O['model']> & keyof TTypeMap['model'],
  HasCacheFromOptions<O>
>;

export type DefineRepoDefaults = {
  /**
   * App-wide cache defaults. Per-repo `cache: true` uses these as-is;
   * `cache: { ttl }` merges on top; omitting `cache` keeps the repo uncached.
   */
  cache?: CacheOptions;
};

function mergeCacheOption(
  defaults: CacheOptions | undefined,
  override: RepositoryOptions['cache'] | undefined,
): RepositoryOptions['cache'] | undefined {
  if (override === undefined) return undefined;
  if (override === true) {
    return defaults ? { ...defaults } : true;
  }
  if (defaults) {
    return { ...defaults, ...override };
  }
  return override;
}

/**
 * Bind your app's `Prisma.TypeMap` once, then define repositories with only
 * runtime options — no select/create/payload phantoms.
 *
 * `model` is constrained to `TypeMap['meta']['modelProps']` so the IDE
 * autocompletes and typos fail at compile time.
 *
 * When `cache` is set on options, the returned API includes `setCache` /
 * `cacheTags` / invalidation fields; otherwise those fields are omitted from types.
 *
 * @example
 * export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
 *   cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
 * });
 *
 * export class ProfileRepository extends defineAppRepo({
 *   model: 'profile',
 *   cache: true,
 * }) {}
 */
export function createDefineRepo<TTypeMap extends PrismaTypeMapLike>(
  defaults?: DefineRepoDefaults,
) {
  return function defineRepo<
    const O extends RuntimeRepoOptions<ModelKeyOf<TTypeMap>>,
  >(options: O): InjectableRepo<RepoApi<TTypeMap, O>> {
    const merged = {
      ...options,
      cache: mergeCacheOption(defaults?.cache, options.cache),
    };
    return createInjectableRepository(merged) as unknown as InjectableRepo<
      RepoApi<TTypeMap, O>
    >;
  };
}
