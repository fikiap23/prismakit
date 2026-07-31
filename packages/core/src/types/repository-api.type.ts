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

/**
 * Public repository method surface for the strong types-bag API.
 *
 * Declared explicitly (not via `InstanceType` of the factory impl) so
 * TypeScript / IDEs resolve `ApplyRepoPayload` cleanly instead of collapsing
 * to `any` / `unknown` through deep conditional chains.
 */
export interface RepositoryApi<
  TSelect extends object,
  TCreateInput,
  TUpdateInput,
  TWhereInput,
  TOrderBy,
  TPayload extends RepoPayloadHKT,
> {
  invalidateCache(opts?: { id?: string; tags?: string[] }): Promise<void>;

  create<T extends TSelect>(args: {
    tx?: ClientLike;
    data: TCreateInput;
    select?: T;
    invalidate?: InvalidateMode;
    tags?: MutationTags<ApplyRepoPayload<TPayload, T>>;
  }): Promise<ApplyRepoPayload<TPayload, T>>;

  getById<T extends TSelect>(params: {
    id: string;
    select?: T;
    tx?: ClientLike;
    lock?: RowLockOptions;
    setCache?: boolean;
  }): Promise<ApplyRepoPayload<TPayload, T> | null>;

  getThrowById<T extends TSelect>(params: {
    id: string;
    select?: T;
    tx?: ClientLike;
    lock?: RowLockOptions;
    setCache?: boolean;
  }): Promise<ApplyRepoPayload<TPayload, T>>;

  getFirst<T extends TSelect>(args: {
    tx?: ClientLike;
    where?: TWhereInput;
    select?: T;
    setCache?: boolean;
    cacheTags?: string[] | ((where?: TWhereInput) => string[]);
  }): Promise<ApplyRepoPayload<TPayload, T> | null>;

  getMany<T extends TSelect>(args: {
    tx?: ClientLike;
    where?: TWhereInput;
    select?: T;
    orderBy?: TOrderBy;
    take?: number;
    skip?: number;
    setCache?: boolean;
    cacheTags?: string[] | ((where?: TWhereInput) => string[]);
  }): Promise<ApplyRepoPayload<TPayload, T>[]>;

  getManyPaginate<T extends TSelect>(args: {
    tx?: ClientLike;
    where?: TWhereInput;
    select?: T;
    orderBy?: TOrderBy;
    page?: number;
    pageSize?: number;
    setCache?: boolean;
    cacheTags?: string[] | ((where?: TWhereInput) => string[]);
  }): Promise<PaginatedResult<ApplyRepoPayload<TPayload, T>>>;

  updateById<T extends TSelect>(args: {
    tx?: ClientLike;
    id: string;
    data: TUpdateInput;
    select?: T;
    invalidate?: InvalidateMode;
    tags?: MutationTags<ApplyRepoPayload<TPayload, T>>;
  }): Promise<ApplyRepoPayload<TPayload, T>>;

  deleteById<T extends TSelect>(args: {
    tx?: ClientLike;
    id: string;
    select?: T;
    invalidate?: InvalidateMode;
    tags?: MutationTags<ApplyRepoPayload<TPayload, T>>;
  }): Promise<ApplyRepoPayload<TPayload, T>>;
}

/** Repository API derived from a {@link RepoTypesDefinition} bag. */
export type RepositoryApiFromTypes<TTypes extends RepoTypesDefinition> =
  RepositoryApi<
    TTypes['select'],
    TTypes['create'],
    TTypes['update'],
    TTypes['where'],
    TTypes['orderBy'],
    TTypes['payload']
  >;

/** Constructor returned by Nest / core factories for a types bag. */
export type RepositoryCtorFromTypes<TTypes extends RepoTypesDefinition> = new (
  ...args: never[]
) => RepositoryApiFromTypes<TTypes>;
