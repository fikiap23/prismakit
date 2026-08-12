import type { InvalidateMode } from './cache-options.type';
import type { CursorPage, PaginatedResult } from './paginated-result.type';
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
  | undefined
  | ((result: TPayload) => string[] | null | undefined);

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
      /** Optional; omit or pass undefined — no need for `tags: null`. */
      tags?: MutationTags<TPayload>;
    }
  : {};

type InvalidateCacheMethod<THasCache extends boolean> = THasCache extends true
  ? {
      invalidateCache(opts?: { id?: string; tags?: string[] }): Promise<void>;
    }
  : {};

type CountSelect = object;

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

  createMany(
    args: {
      tx?: ClientLike;
      data: TCreateInput[];
      skipDuplicates?: boolean;
    } & CacheMutation<unknown, THasCache>,
  ): Promise<{ count: number }>;

  createManyAndReturn<T extends TSelect>(
    args: {
      tx?: ClientLike;
      data: TCreateInput[];
      select?: T;
      skipDuplicates?: boolean;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>[], THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>[]>;

  getById<T extends TSelect>(
    params: {
      id: string | Record<string, string>;
      select?: T;
      tx?: ClientLike;
      lock?: RowLockOptions;
    } & CacheIdRead<THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T> | null>;

  getThrowById<T extends TSelect>(
    params: {
      id: string | Record<string, string>;
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
      lock?: RowLockOptions;
    } & CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T> | null>;

  getThrowFirst<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      lock?: RowLockOptions;
    } & CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  getMany<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      take?: number;
      skip?: number;
      lock?: RowLockOptions;
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

  getManyCursor<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      cursor?: unknown;
      take?: number;
      skip?: number;
    } & CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<CursorPage<ApplyRepoPayload<TPayload, T>>>;

  count(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
      select?: CountSelect;
    } & CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<number>;

  exists(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
    } & CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<boolean>;

  aggregate(
    args: {
      tx?: ClientLike;
      where?: TWhereInput;
    } & Record<string, unknown> &
      CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<unknown>;

  groupBy(
    args: {
      tx?: ClientLike;
    } & Record<string, unknown> &
      CacheQueryRead<TWhereInput, THasCache>,
  ): Promise<unknown>;

  update<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where: TWhereInput;
      data: TUpdateInput;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  updateById<T extends TSelect>(
    args: {
      tx?: ClientLike;
      id: string | Record<string, string>;
      data: TUpdateInput;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  updateMany(
    args: {
      tx?: ClientLike;
      where: TWhereInput;
      data: TUpdateInput;
    } & CacheMutation<unknown, THasCache>,
  ): Promise<{ count: number }>;

  updateManyAndReturn<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where: TWhereInput;
      data: TUpdateInput;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>[], THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>[]>;

  upsert<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where: TWhereInput;
      create: TCreateInput;
      update: TUpdateInput;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  upsertMany<T extends TSelect>(
    args: {
      tx?: ClientLike;
      items: Array<{
        where: TWhereInput;
        create: TCreateInput;
        update: TUpdateInput;
      }>;
      select?: T;
      chunkSize?: number;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>[], THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>[]>;

  delete<T extends TSelect>(
    args: {
      tx?: ClientLike;
      where: TWhereInput;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  deleteById<T extends TSelect>(
    args: {
      tx?: ClientLike;
      id: string | Record<string, string>;
      select?: T;
    } & CacheMutation<ApplyRepoPayload<TPayload, T>, THasCache>,
  ): Promise<ApplyRepoPayload<TPayload, T>>;

  deleteMany(
    args: {
      tx?: ClientLike;
      where: TWhereInput;
    } & CacheMutation<unknown, THasCache>,
  ): Promise<{ count: number }>;

  queryRaw<T = unknown>(args: {
    tx?: ClientLike;
    sql: TemplateStringsArray | string;
    values?: unknown[];
  }): Promise<T>;

  executeRaw(
    args: {
      tx?: ClientLike;
      sql: TemplateStringsArray | string;
      values?: unknown[];
    } & CacheMutation<unknown, THasCache>,
  ): Promise<number>;
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
