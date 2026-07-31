import type { InvalidateMode } from './cache-options.type';
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

/**
 * Repository method surface typed from Prisma `TypeMap` — no per-repo
 * phantoms / payload HKT class required.
 */
export interface RepositoryApiFromTypeMap<
  TTypeMap extends PrismaTypeMapLike,
  TModel extends keyof TTypeMap['model'],
> {
  invalidateCache(opts?: { id?: string; tags?: string[] }): Promise<void>;

  create<T extends TypeMapSelect<TTypeMap, TModel>>(args: {
    tx?: ClientLike;
    data: TypeMapCreateInput<TTypeMap, TModel>;
    select?: T;
    invalidate?: InvalidateMode;
    tags?: MutationTags<TypeMapGetPayload<TTypeMap, TModel, T>>;
  }): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  getById<T extends TypeMapSelect<TTypeMap, TModel>>(params: {
    id: string;
    select?: T;
    tx?: ClientLike;
    lock?: RowLockOptions;
    setCache?: boolean;
  }): Promise<TypeMapGetPayload<TTypeMap, TModel, T> | null>;

  getThrowById<T extends TypeMapSelect<TTypeMap, TModel>>(params: {
    id: string;
    select?: T;
    tx?: ClientLike;
    lock?: RowLockOptions;
    setCache?: boolean;
  }): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  getFirst<T extends TypeMapSelect<TTypeMap, TModel>>(args: {
    tx?: ClientLike;
    where?: TypeMapWhereInput<TTypeMap, TModel>;
    select?: T;
    setCache?: boolean;
    cacheTags?:
      | string[]
      | ((where?: TypeMapWhereInput<TTypeMap, TModel>) => string[]);
  }): Promise<TypeMapGetPayload<TTypeMap, TModel, T> | null>;

  getMany<T extends TypeMapSelect<TTypeMap, TModel>>(args: {
    tx?: ClientLike;
    where?: TypeMapWhereInput<TTypeMap, TModel>;
    select?: T;
    orderBy?: TypeMapOrderByInput<TTypeMap, TModel>;
    take?: number;
    skip?: number;
    setCache?: boolean;
    cacheTags?:
      | string[]
      | ((where?: TypeMapWhereInput<TTypeMap, TModel>) => string[]);
  }): Promise<TypeMapGetPayload<TTypeMap, TModel, T>[]>;

  getManyPaginate<T extends TypeMapSelect<TTypeMap, TModel>>(args: {
    tx?: ClientLike;
    where?: TypeMapWhereInput<TTypeMap, TModel>;
    select?: T;
    orderBy?: TypeMapOrderByInput<TTypeMap, TModel>;
    page?: number;
    pageSize?: number;
    setCache?: boolean;
    cacheTags?:
      | string[]
      | ((where?: TypeMapWhereInput<TTypeMap, TModel>) => string[]);
  }): Promise<PaginatedResult<TypeMapGetPayload<TTypeMap, TModel, T>>>;

  updateById<T extends TypeMapSelect<TTypeMap, TModel>>(args: {
    tx?: ClientLike;
    id: string;
    data: TypeMapUpdateInput<TTypeMap, TModel>;
    select?: T;
    invalidate?: InvalidateMode;
    tags?: MutationTags<TypeMapGetPayload<TTypeMap, TModel, T>>;
  }): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;

  deleteById<T extends TypeMapSelect<TTypeMap, TModel>>(args: {
    tx?: ClientLike;
    id: string;
    select?: T;
    invalidate?: InvalidateMode;
    tags?: MutationTags<TypeMapGetPayload<TTypeMap, TModel, T>>;
  }): Promise<TypeMapGetPayload<TTypeMap, TModel, T>>;
}
