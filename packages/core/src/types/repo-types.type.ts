/**
 * Higher-kinded payload mapper for Prisma `GetPayload`.
 *
 * A generic function `payload: <T>(select: T) => GetPayload<{ select: T }>`
 * cannot be instantiated by TypeScript conditional types — inference collapses
 * to `unknown` / the full model. An interface HKT with `this` works:
 *
 * @example
 * type UserPayloadOf<S> = S extends Prisma.UserSelect
 *   ? Prisma.UserGetPayload<{ select: S }>
 *   : never;
 *
 * interface UserPayloadHKT extends RepoPayloadHKT {
 *   type(): UserPayloadOf<this['_select']>;
 * }
 */
export interface RepoPayloadHKT {
  readonly _select: unknown;
  type(): unknown;
}

/** Apply a {@link RepoPayloadHKT} to a concrete select. */
export type ApplyRepoPayload<
  M extends RepoPayloadHKT,
  T,
> = ReturnType<(M & { _select: T })['type']>;

/**
 * Strong repository typing bag for Prisma (or any select→payload mapper).
 *
 * Prefer this over passing 7 type parameters + a runtime `toPayload`.
 *
 * @example
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
 */
export type RepoTypesDefinition<TSelect extends object = object> = {
  select: TSelect;
  create?: unknown;
  update?: unknown;
  where?: unknown;
  orderBy?: unknown;
  /**
   * Higher-kinded select→payload mapper ({@link RepoPayloadHKT}).
   * Do not use a generic function here — TS cannot infer Prisma `GetPayload` from it.
   */
  payload: RepoPayloadHKT;
};

/**
 * `toPayload` function signature derived from {@link RepoTypesDefinition}.
 * Carries `__hkt` so {@link InferRepositoryPayload} can re-apply the HKT to
 * each concrete select (generic-function `infer R` alone is not enough for Prisma).
 */
export type ToPayloadFromTypes<TTypes extends RepoTypesDefinition> = (<
  T extends TTypes['select'],
>(
  data: unknown,
) => ApplyRepoPayload<TTypes['payload'], T>) & {
  readonly __hkt: TTypes['payload'];
};

/** Result payload for a concrete select, from a types bag. */
export type PayloadFromTypes<
  TTypes extends RepoTypesDefinition,
  T extends TTypes['select'],
> = ApplyRepoPayload<TTypes['payload'], T>;
