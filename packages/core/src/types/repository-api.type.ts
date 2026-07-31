import type { InvalidateMode } from './cache-options.type';
import type { PaginatedResult } from './paginated-result.type';
import type {
  ApplyRepoPayload,
  RepoPayloadHKT,
  RepoTypesDefinition,
} from './repo-types.type';
import type { RowLockOptions } from './row-lock-options.type';

/** Minimal client / transaction shape for repository method args. */
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
 * Public repository method surface for the strong types-bag API.
 *
 * `THasCache` controls whether cache-only args (`setCache`, `cacheTags`,
 * mutation `invalidate`/`tags`) and `invalidateCache` appear — match the
 * repository `cache` config for better IDE DX.
 */
export type RepositoryApi<
  TSelect extends object,
  TCreateInput,
  TUpdateInput,
  TWhereInput,
  TOrderBy,
  TPayload extends RepoPayloadHKT,
  THasCache extends boolean = false,
> = {
  create<T extends TSelect>(
    args: {
      tx?: ClientLike;
      data: TCreateInput;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  getById<T extends TSelect>(
    params: {
      id: string;
      select?: T;
      tx?: ClientLike;
      lock?: RowLockOptions;
    } & CacheIdRead<THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T> | null>;

  getThrowById<T extends TSelect>(
    params: {
      id: string;
      select?: T;
      tx?: ClientLike;
      lock?: RowLockOptions;
    } & CacheIdRead<THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  getFirst<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
      select?: T;
    } & CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T> | null>;

  getMany<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      take?: number;
      skip?: number;
    } & CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>[]>;

  getManyPaginate<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      page?: number;
      pageSize?: number;
    } & CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<PaginatedResult<ApplyRepoPayload<TPayload, T>>>;

  updateById<T extends TSelect>(
    args: {
      tx?: ClientLike;
      id: string;
      data: TUpdateInput;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  deleteById<T extends TSelect>(
    args: {
      tx?: ClientLike;
      id: string;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;
} & InvalidateCacheMethod<THasCache>;

/** Repository API derived from a {@link RepoTypesDefinition} bag. */
export type RepositoryApiFromTypes<
  TTypes extends RepoTypesDefinition,
  THasCache extends boolean = false,
> = RepositoryApi<
  TTypes['select'],
  TTypes['create'],
  TTypes['update'],
  TTypes['where'],
  TTypes['orderBy'],
  TTypes['payload'],
  THasCache
>;

/** Constructor returned by Nest / core factories for a types bag. */
export type RepositoryCtorFromTypes<
  TTypes extends RepoTypesDefinition,
  THasCache extends boolean = false,
> = new (...args: never[]) => RepositoryApiFromTypes<TTypes, THasCache>;
