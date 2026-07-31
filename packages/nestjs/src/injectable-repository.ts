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

import { PRISMAKIT_CACHE, PRISMAKIT_PRISMA } from './tokens';

/**
 * Wraps `createRepository` in an `@Injectable()` Nest class that receives
 * Prisma / cache / registry / composer via DI tokens.
 *
 * Feature modules register the returned class in `providers` — they must not
 * inject `PRISMAKIT_PRISMA` themselves.
 *
 * Thin usage (defaults for getDelegate / toPayload when `model` is set):
 *
 * ```ts
 * export const UserRepository = createInjectableRepository({
 *   model: 'user',
 *   cache: { ttl: 86400 },
 *   lock: 'users',
 * });
 * ```
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
) {
  const RepoClass = createRepository(options);

  @Injectable()
  class NestRepository extends RepoClass {
    constructor(
      @Inject(PRISMAKIT_PRISMA) prisma: PrismaClientLike,
      @Optional() @Inject(PRISMAKIT_CACHE) cache?: CacheAdapter,
      @Optional() registry?: RepositoryRegistry,
      @Optional() autoCompose?: AutoComposer,
    ) {
      super({ prisma, cache, registry, autoCompose });
    }
  }

  return NestRepository as unknown as new (
    ...args: ConstructorParameters<typeof NestRepository>
  ) => RepositoryInstance<
    TSelect,
    TCreateInput,
    TUpdateInput,
    TWhereInput,
    TOrderBy,
    TToPayload,
    TRepoModel
  > &
    InstanceType<typeof NestRepository>;
}

/** Alias matching myrpc-be naming for easier migration. */
export const createPrismaRepository = createInjectableRepository;
