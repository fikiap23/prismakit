import {
  type HasCacheFromOptions,
  type RepositoryApi,
  type RepositoryOptions,
  type RepoPayloadHKT,
} from '@prismakit/core';

import { createInjectableRepository } from './injectable-repository';

type DefineRepoOptions<
  TSelect extends object,
  TCreate,
  TUpdate,
  TWhere,
  TOrderBy,
  TPayload extends RepoPayloadHKT,
> = {
  model: string;
  scalarFields?: Record<string, string>;
  cache?: RepositoryOptions['cache'];
  lock?: RepositoryOptions['lock'];
  schemaPath?: string;
  /** Type-only phantom — pass `null! as Prisma.XSelect`. */
  select: TSelect;
  /** Type-only phantom — pass `null! as Prisma.XCreateInput`. */
  create: TCreate;
  /** Type-only phantom — pass `null! as Prisma.XUpdateInput`. */
  update: TUpdate;
  /** Type-only phantom — pass `null! as Prisma.XWhereInput`. */
  where: TWhere;
  /** Type-only phantom — pass `null! as Prisma.XOrderByWithRelationInput`. */
  orderBy: TOrderBy;
  /**
   * Payload HKT class. Prefer:
   * ```ts
   * type Of<S> = S extends Prisma.XSelect
   *   ? Prisma.XGetPayload<{ select: S }>
   *   : never;
   * payload: class {
   *   declare readonly _select: unknown;
   *   declare type: () => Of<this['_select']>;
   * }
   * ```
   */
  payload: abstract new (...args: never[]) => TPayload;
};

/**
 * Compact Nest repository factory — one call, no separate types bag / interface.
 *
 * PrismaKit stays model-agnostic; you pass Prisma types as phantoms + a tiny
 * payload HKT class (required for precise `GetPayload` inference).
 *
 * @example
 * type Of<S> = S extends Prisma.AuditLogSelect
 *   ? Prisma.AuditLogGetPayload<{ select: S }>
 *   : never;
 *
 * export const AuditLogRepository = defineInjectableRepository({
 *   model: 'auditLog',
 *   scalarFields: Prisma.AuditLogScalarFieldEnum,
 *   select: null! as Prisma.AuditLogSelect,
 *   create: null! as Prisma.AuditLogCreateInput,
 *   update: null! as Prisma.AuditLogUpdateInput,
 *   where: null! as Prisma.AuditLogWhereInput,
 *   orderBy: null! as Prisma.AuditLogOrderByWithRelationInput,
 *   payload: class {
 *     declare readonly _select: unknown;
 *     declare type: () => Of<this['_select']>;
 *   },
 * });
 *
 * export type AuditLogRepository = InstanceType<typeof AuditLogRepository>;
 */
export function defineInjectableRepository<
  TSelect extends object,
  TCreate,
  TUpdate,
  TWhere,
  TOrderBy,
  TPayload extends RepoPayloadHKT,
  const O extends DefineRepoOptions<
    TSelect,
    TCreate,
    TUpdate,
    TWhere,
    TOrderBy,
    TPayload
  >,
>(
  options: O,
): new (
  ...args: never[]
) => RepositoryApi<
  TSelect,
  TCreate,
  TUpdate,
  TWhere,
  TOrderBy,
  TPayload,
  HasCacheFromOptions<O>
> {
  const {
    select: _select,
    create: _create,
    update: _update,
    where: _where,
    orderBy: _orderBy,
    payload: _payload,
    ...runtime
  } = options;
  void _select;
  void _create;
  void _update;
  void _where;
  void _orderBy;
  void _payload;

  return createInjectableRepository(runtime) as new (
    ...args: never[]
  ) => RepositoryApi<
    TSelect,
    TCreate,
    TUpdate,
    TWhere,
    TOrderBy,
    TPayload,
    HasCacheFromOptions<O>
  >;
}

/** Alias — shorter name for the same helper. */
export const defineRepo = defineInjectableRepository;
