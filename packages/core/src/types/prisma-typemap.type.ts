/**
 * Structural subset of Prisma `TypeMap` used by {@link createDefineRepo}.
 * Keeps @prismakit/* decoupled from a concrete generated client — no imports
 * from `@prisma/client/runtime/*` (those break IDE resolution inside
 * node_modules/@prismakit/*).
 */
export type PrismaOperationPayloadLike = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scalars: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  objects: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  composites: any;
};

export type PrismaTypeMapLike = {
  model: {
    [key: string]: {
      payload: PrismaOperationPayloadLike;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      operations: Record<string, any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fields?: any;
    };
  };
};

type ModelOf<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
> = TTypeMap['model'][TModel];

type OpsOf<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
> = ModelOf<TTypeMap, TModel>['operations'];

type ArgsData<TArgs> = TArgs extends { data: infer D } ? D : unknown;
type ArgsWhere<TArgs> = TArgs extends { where?: infer W } ? W : unknown;
type ArgsOrderBy<TArgs> = TArgs extends { orderBy?: infer O } ? O : unknown;
type ArgsSelect<TArgs> = TArgs extends { select?: infer S }
  ? NonNullable<S>
  : object;

export type TypeMapSelect<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
> = ArgsSelect<OpsOf<TTypeMap, TModel>['findMany']['args']> & object;

export type TypeMapCreateInput<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
> = OpsOf<TTypeMap, TModel> extends { create: { args: infer A } }
  ? ArgsData<A>
  : unknown;

export type TypeMapUpdateInput<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
> = OpsOf<TTypeMap, TModel> extends { update: { args: infer A } }
  ? ArgsData<A>
  : unknown;

export type TypeMapWhereInput<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
> = ArgsWhere<OpsOf<TTypeMap, TModel>['findMany']['args']>;

export type TypeMapOrderByInput<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
> = ArgsOrderBy<OpsOf<TTypeMap, TModel>['findMany']['args']>;

type PayloadScalars<P> = P extends { scalars: infer S } ? S : never;
type PayloadObjects<P> = P extends { objects: infer O } ? O : never;

type Unarray<T> = T extends (infer U)[] ? U : T;

type DefaultPayloadResult<TPayload> = PayloadScalars<TPayload>;

type RelationResult<TRel, TSub> = [TSub] extends [true]
  ? DefaultPayloadResult<Unarray<NonNullable<TRel>>>
  : SelectPayloadResult<Unarray<NonNullable<TRel>>, TSub>;

type MaybeArrayRelation<TRel, TInner> = [TRel] extends [(infer _U)[]]
  ? TInner[]
  : null extends TRel
    ? TInner | null
    : TInner;

/**
 * Lightweight select→result mapper (no `@prisma/client/runtime` import).
 * Covers scalar `true` and nested `{ select }` on relations.
 */
export type SelectPayloadResult<TPayload, TSelect> = {
  [K in keyof TSelect as TSelect[K] extends false | undefined
    ? never
    : K]: TSelect[K] extends true
    ? K extends keyof PayloadScalars<TPayload>
      ? PayloadScalars<TPayload>[K]
      : K extends keyof PayloadObjects<TPayload>
        ? MaybeArrayRelation<
            PayloadObjects<TPayload>[K],
            DefaultPayloadResult<
              Unarray<NonNullable<PayloadObjects<TPayload>[K]>>
            >
          >
        : never
    : TSelect[K] extends { select: infer Sub }
      ? K extends keyof PayloadObjects<TPayload>
        ? MaybeArrayRelation<
            PayloadObjects<TPayload>[K],
            RelationResult<PayloadObjects<TPayload>[K], Sub>
          >
        : never
      : never;
};

/**
 * Precise-enough select→result mapping for repository APIs.
 * Prefer this over Prisma runtime `GetResult` so IDEs resolve types from
 * `@prismakit/*` without loading `@prisma/client/runtime/*` through the kit.
 */
export type TypeMapGetPayload<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
  TSelect,
> = [TSelect] extends [true]
  ? DefaultPayloadResult<ModelOf<TTypeMap, TModel>['payload']>
  : [TSelect] extends [undefined]
    ? DefaultPayloadResult<ModelOf<TTypeMap, TModel>['payload']>
    : SelectPayloadResult<ModelOf<TTypeMap, TModel>['payload'], TSelect>;

/** Capitalize first letter: `auditLog` → `AuditLog`. */
export type CamelToPascal<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${R}`
  : S;
