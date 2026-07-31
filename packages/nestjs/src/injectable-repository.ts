import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AutoComposer,
  createRepository,
  RepositoryRegistry,
  type CacheAdapter,
  type DefaultToPayload,
  type PrismaClientLike,
  type RepositoryOptions,
  type RepositoryOptionsFromTypes,
  type RepositoryInstance,
  type RepositoryApiFromTypes,
  type RepoPayloadHKT,
  type RepoTypesDefinition,
} from '@prismakit/core';

import { PRISMAKIT_CACHE, PRISMAKIT_PRISMA } from './tokens';

/**
 * Wraps `createRepository` in an `@Injectable()` Nest class.
 *
 * Strong typing (recommended) — one types bag, no runtime `toPayload`:
 *
 * ```ts
 * type UserPayloadOf<S> = S extends Prisma.UserSelect
 *   ? Prisma.UserGetPayload<{ select: S }>
 *   : never;
 *
 * interface UserPayloadHKT extends RepoPayloadHKT {
 *   type(): UserPayloadOf<this['_select']>;
 * }
 *
 * type UserTypes = {
 *   select: Prisma.UserSelect;
 *   create: Prisma.UserCreateInput;
 *   update: Prisma.UserUpdateInput;
 *   where: Prisma.UserWhereInput;
 *   orderBy: Prisma.UserOrderByWithRelationInput;
 *   payload: UserPayloadHKT;
 * };
 *
 * export const UserRepository = createInjectableRepository<UserTypes>({
 *   model: 'user',
 *   scalarFields: Prisma.UserScalarFieldEnum,
 *   cache: { ttl: 86400 },
 *   lock: 'users',
 * });
 * ```
 */
export function createInjectableRepository<TTypes extends RepoTypesDefinition>(
  options: RepositoryOptionsFromTypes<TTypes>,
): new (...args: never[]) => RepositoryApiFromTypes<TTypes>;
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
  options: TSelect extends { payload: RepoPayloadHKT }
    ? never
    : RepositoryOptions<
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
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createInjectableRepository(
  options: RepositoryOptions<any, any, any, any, any, any, any>,
): any {
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

  // Overload signatures own the public type; do not re-derive from NestRepository
  // (that erases generics and surfaces as `any` in IDEs).
  return NestRepository;
}

/** Alias matching myrpc-be naming for easier migration. */
export const createPrismaRepository = createInjectableRepository;
