import type { CacheOptions, InvalidateMode } from './cache-options.type';
import type { PaginatedResult } from './paginated-result.type';
import type {
  PrismaTypeMapLike,
  TypeMapCreateInput,
  TypeMapCreateManyInput,
  TypeMapGetPayload,
  TypeMapOrderByInput,
  TypeMapSelect,
  TypeMapUpdateInput,
  TypeMapUpdateManyInput,
  TypeMapWhereInput,
  TypeMapWhereUniqueInput,
} from './prisma-typemap.type';
import type { RowLockOptions } from './row-lock-options.type';

type ClientLike = { [key: string]: unknown };

type MutationTags<TPayload> =
  | string[]
  | null
  | ((result: TPayload) => string[] | null);

type CacheIdRead<THasCache extends boolean> = THasCache extends true
  ? { setCache?: boolean }
  : {};

type CacheQueryRead<TWhereInput, THasCache extends boolean> =
  THasCache extends true
    ? {
        setCache?: boolean;
        cacheTags?: string[] | ((where?: TWhereInput) => string[]);
      }
    : {};

type CacheMutation<TPayload, THasCache extends boolean> = THasCache extends true
  ? {
      invalidate?: InvalidateMode;
      tags?: MutationTags<TPayload>;
    }
  : {};

type InvalidateCacheMethod<THasCache extends boolean> = THasCache extends true
  ? {
      invalidateCache(opts?: { id?: string; tags?: string[] }): Promise<void>;
    }
  : {};

type IdArg = string | Record<string, string>;

/**
 * True when factory options include a concrete `cache` config (`true` or options object).
 */
export type HasCacheFromOptions<O> = O extends {
  cache: CacheOptions | true;
}
  ? true
  : false;

/**
 * Instance type of a constructor returned by `createDefineRepo` / `defineAppRepo`.
 */
export type RepositoryOf<TCtor extends abstract new (...args: never[]) => unknown> =
  InstanceType<TCtor>;

/**
 * Repository method surface typed from Prisma `TypeMap` — no per-repo
 * phantoms / payload HKT class required.
 *
 * `THasCache` gates cache-only fields so repos without `cache` config do not
 * suggest `setCache` / `cacheTags` / invalidation options in the IDE.
 */
export type RepositoryApiFromTypeMap<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
  THasCache extends boolean = false,
> = {
  create<T extends TypeMapSelect<TTypeMap, TModel>>(
    args: {
      tx?: ClientLike;
      data: TypeMapCreateInput<TTypeMap, TModel>;
      select?: T;
    } & CacheMutation<TypeMapGetPayload<TTypeMap, TModel, T>, THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  createMany(
    args: {
      tx?: ClientLike;
      data: TypeMapCreateManyInput<TTypeMap, TModel>[];
      skipDuplicates?: boolean;
    } & CacheMutation<unknown, THasCache>,
  ): Promise<{ count: number }>;

  getById<T extends TypeMapSelect<TTypeMap, TModel>>(
    params: {
      id: IdArg;
      select?: T;
      tx?: ClientLike;
      lock?: RowLockOptions;
    } & CacheIdRead<THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T> | null>;

  getThrowById<T extends TypeMapSelect<TTypeMap, TModel>>(
    params: {
      id: IdArg;
      select?: T;
      tx?: ClientLike;
      lock?: RowLockOptions;
    } & CacheIdRead<THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  getFirst<T extends TypeMapSelect<TTypeMap, TModel>>(
    args: {
      tx?: ClientLike;
      where?: TypeMapWhereInput<TTypeMap, TModel>;
      select?: T;
      orderBy?: TypeMapOrderByInput<TTypeMap, TModel>;
      lock?: RowLockOptions;
    } & CacheQueryRead<TypeMapWhereInput<TTypeMap, TModel>, THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T> | null>;

  getMany<T extends TypeMapSelect<TTypeMap, TModel>>(
    args: {
      tx?: ClientLike;
      where?: TypeMapWhereInput<TTypeMap, TModel>;
      select?: T;
      orderBy?: TypeMapOrderByInput<TTypeMap, TModel>;
      take?: number;
      skip?: number;
      lock?: RowLockOptions;
    } & CacheQueryRead<TypeMapWhereInput<TTypeMap, TModel>, THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T>[]>;

  getManyPaginate<T extends TypeMapSelect<TTypeMap, TModel>>(
    args: {
      tx?: ClientLike;
      where?: TypeMapWhereInput<TTypeMap, TModel>;
      select?: T;
      orderBy?: TypeMapOrderByInput<TTypeMap, TModel>;
      page?: number;
      pageSize?: number;
    } & CacheQueryRead<TypeMapWhereInput<TTypeMap, TModel>, THasCache>,
  ): Promise<PaginatedResult<TypeMapGetPayload<TTypeMap, TModel, T>>>;

  updateById<T extends TypeMapSelect<TTypeMap, TModel>>(
    args: {
      tx?: ClientLike;
      id: IdArg;
      data: TypeMapUpdateInput<TTypeMap, TModel>;
      select?: T;
    } & CacheMutation<TypeMapGetPayload<TTypeMap, TModel, T>, THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  updateMany(
    args: {
      tx?: ClientLike;
      where: TypeMapWhereInput<TTypeMap, TModel>;
      data: TypeMapUpdateManyInput<TTypeMap, TModel>;
    } & CacheMutation<unknown, THasCache>,
  ): Promise<{ count: number }>;

  upsert<T extends TypeMapSelect<TTypeMap, TModel>>(
    args: {
      tx?: ClientLike;
      where: TypeMapWhereUniqueInput<TTypeMap, TModel>;
      create: TypeMapCreateInput<TTypeMap, TModel>;
      update: TypeMapUpdateInput<TTypeMap, TModel>;
      select?: T;
    } & CacheMutation<TypeMapGetPayload<TTypeMap, TModel, T>, THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  deleteById<T extends TypeMapSelect<TTypeMap, TModel>>(
    args: {
      tx?: ClientLike;
      id: IdArg;
      select?: T;
    } & CacheMutation<TypeMapGetPayload<TTypeMap, TModel, T>, THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  deleteMany(
    args: {
      tx?: ClientLike;
      where: TypeMapWhereInput<TTypeMap, TModel>;
    } & CacheMutation<unknown, THasCache>,
  ): Promise<{ count: number }>;
} & InvalidateCacheMethod<THasCache>;
