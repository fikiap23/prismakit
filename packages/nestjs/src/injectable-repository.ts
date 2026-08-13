import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AutoComposer,
  createRepository,
  RepositoryRegistry,
  type CacheAdapter,
  type DefaultToPayload,
  type PrismaClientLike,
  type RepositoryOptions,
  type RepositoryInstance,
} from '@prismakit/core';

import { markPrismakitRepo } from './inherit-repo-inject';
import { PRISMAKIT_CACHE, PRISMAKIT_PRISMA } from './tokens';

/**
 * Wraps `createRepository` in an `@Injectable()` Nest class.
 *
 * Prefer {@link createDefineRepo} for TypeMap-bound apps. This factory is the
 * low-level escape hatch when TypeMap binding is unavailable (results are thinly typed).
 */
export function createInjectableRepository<
  TSelect extends object = object,
  TCreateInput = unknown,
  TUpdateInput = unknown,
  TWhereInput = unknown,
  TOrderBy = unknown,
  TToPayload extends <T extends TSelect>(
    data: unknown,
  ) => unknown = DefaultToPayload<TSelect>,
  TRepoModel extends string = never,
>(
  options: RepositoryOptions<
    TSelect,
    TCreateInput,
    TUpdateInput,
    TWhereInput,
    TOrderBy,
    TToPayload,
    TRepoModel
  >,
): new (
  ...args: never[]
) => RepositoryInstance<
  TSelect,
  TCreateInput,
  TUpdateInput,
  TWhereInput,
  TOrderBy,
  TToPayload,
  TRepoModel
> {
  const RepoClass = createRepository(options);

  @Injectable()
  class NestRepository extends RepoClass {
    constructor(
      @Inject(PRISMAKIT_PRISMA) prisma: PrismaClientLike,
      @Optional() @Inject(PRISMAKIT_CACHE) cache?: CacheAdapter,
      // Explicit @Inject required: tsup/esbuild does not emit design:paramtypes,
      // so Nest cannot resolve class tokens from TypeScript types alone.
      @Optional() @Inject(RepositoryRegistry) registry?: RepositoryRegistry,
      @Optional() @Inject(AutoComposer) autoCompose?: AutoComposer,
    ) {
      super({ prisma, cache, registry, autoCompose });
    }
  }

  markPrismakitRepo(NestRepository, {
    model: typeof options.model === 'string' ? options.model : undefined,
    hasCache: options.cache != null,
  });

  return NestRepository as new (
    ...args: never[]
  ) => RepositoryInstance<
    TSelect,
    TCreateInput,
    TUpdateInput,
    TWhereInput,
    TOrderBy,
    TToPayload,
    TRepoModel
  >;
}
