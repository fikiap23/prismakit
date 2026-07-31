import type { CacheOptions, InvalidateMode } from './cache-options.type';
import type { PaginatedResult } from './paginated-result.type';
import type {
  PrismaTypeMapLike,
  TypeMapCreateInput,
  TypeMapGetPayload,
  TypeMapOrderByInput,
  TypeMapSelect,
  TypeMapUpdateInput,
  TypeMapWhereInput,
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

/**
 * True when factory options include a concrete `cache` config (`true` or options object).
 */
export type HasCacheFromOptions<O> = O extends {
  cache: CacheOptions | true;
}
  ? true
  : false;

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

  getById<T extends TypeMapSelect<TTypeMap, TModel>>(
    params: {
      id: string;
      select?: T;
      tx?: ClientLike;
      lock?: RowLockOptions;
    } & CacheIdRead<THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T> | null>;

  getThrowById<T extends TypeMapSelect<TTypeMap, TModel>>(
    params: {
      id: string;
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
      id: string;
      data: TypeMapUpdateInput<TTypeMap, TModel>;
      select?: T;
    } & CacheMutation<TypeMapGetPayload<TTypeMap, TModel, T>, THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  deleteById<T extends TypeMapSelect<TTypeMap, TModel>>(
    args: {
      tx?: ClientLike;
      id: string;
      select?: T;
    } & CacheMutation<TypeMapGetPayload<TTypeMap, TModel, T>, THasCache>,
  ): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;
} & InvalidateCacheMethod<THasCache>;
