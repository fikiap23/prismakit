import type { CacheAdapter } from './cache/cache-adapter.interface';
import { validateCacheConfig } from './cache/validate-cache-config';
import {
  buildEntityKey,
  buildQueryKey,
  entityIndexKey,
  queryIndexKey,
} from './cache/cache-key.util';
import { selectIncludesSensitiveField } from './cache/cache-guard.util';
import { applyJitter } from './cache/ttl-jitter.util';
import { recordCacheDebug } from './cache/cache-debug.util';
import type {
  CacheMethod,
  CacheOptions,
  InvalidateMode,
} from './types/cache-options.type';
import type {
  RepositoryLockConfig,
  RowLockOptions,
} from './types/row-lock-options.type';
import type { PaginatedResult } from './types/paginated-result.type';
import type { PrismaModelDelegate } from './types/prisma-delegate.type';
import type { InferRepositoryPayload } from './types/infer-repository-payload.type';
import type {
  RepositoryApiFromTypes,
  RepositoryCtorFromTypes,
} from './types/repository-api.type';
import type { RepoTypesDefinition, RepoPayloadHKT } from './types/repo-types.type';
import {
  assertLockPrerequisites,
  queryRowForUpdate,
} from './lock/row-lock';
import { validateLockConfig } from './lock/validate-lock-config';
import {
  buildLockConfigFromMeta,
  buildLockConfigFromSchema,
} from './lock/build-lock-config';
import { paginator, type PaginateFunction } from './pagination/paginator';
import { splitSelect } from './utils/split-select';
import { AutoComposer } from './auto-composer';
import { RepositoryRegistry } from './repository-registry';
import { getModelMeta } from './schema/prisma-meta';

const paginate: PaginateFunction = paginator({});

const NULL_SENTINEL = '__NULL__';
const STAMPEDE_LOCK_TTL = 10;
const STAMPEDE_RETRY_MS = 50;
const STAMPEDE_MAX_RETRIES = 3;

const DEFAULT_CACHE_TTL = 86400;

/**
 * Default `toPayload` when callers omit it (identity cast).
 * Prefer {@link RepoTypesDefinition} so return types stay precise without a
 * runtime `toPayload` implementation.
 */
export type DefaultToPayload<TSelect extends object> = <T extends TSelect>(
  data: unknown,
) => unknown;

/** Minimal Prisma client / transaction client shape. */
export type PrismaClientLike = {
  [key: string]: unknown;
};

export type RepositoryDeps = {
  prisma: PrismaClientLike;
  cache?: CacheAdapter;
  registry?: RepositoryRegistry;
  autoCompose?: AutoComposer;
};

export type RepositoryOptions<
  TSelect extends object = object,
  TCreateInput = unknown,
  TUpdateInput = unknown,
  TWhereInput = unknown,
  TOrderBy = unknown,
  TToPayload extends <T extends TSelect>(
    data: unknown,
  ) => unknown = DefaultToPayload<TSelect>,
  TRepoModel extends string = never,
> = {
  model?: TRepoModel;
  /** Cache config, or `true` for `{ ttl: 86400, sensitiveFields: ['password'] }`. */
  cache?: CacheOptions | true;
  /**
   * Lock config, DB table name / client model key (resolved via meta or schema),
   * or `true` to resolve from Prisma meta / schema using `model`.
   */
  lock?: RepositoryLockConfig | string | true;
  schemaPath?: string;
  /**
   * Prisma model delegate accessor. Defaults to `(client) => client[model]`
   * when `model` is set.
   */
  getDelegate?: (client: PrismaClientLike) => PrismaModelDelegate;
  /** Maps raw Prisma results to the public payload type. Defaults to identity. */
  toPayload?: TToPayload;
  /**
   * Scalar field enum for select-split / compose. When omitted, filled from
   * Prisma meta (`loadPrismaMetaFromDmmf`) for `model` if available.
   */
  scalarFields?: Record<string, string>;
  /**
   * Primary key field for `*ById` / row locks. Defaults to Prisma meta PK or `id`.
   */
  primaryKey?: string;
};

/**
 * Options when using the strong {@link RepoTypesDefinition} API.
 *
 * Uses {@link DefaultToPayload} for the options slot on purpose — payload
 * precision comes from {@link RepositoryApiFromTypes} / the HKT on the types
 * bag, not from stuffing `ToPayloadFromTypes` into this constrained slot
 * (that intersection often breaks overload resolution → `any` in IDEs).
 */
export type RepositoryOptionsFromTypes<TTypes extends RepoTypesDefinition> =
  RepositoryOptions<
    TTypes['select'],
    TTypes['create'],
    TTypes['update'],
    TTypes['where'],
    TTypes['orderBy'],
    DefaultToPayload<TTypes['select']>,
    string
  >;

type MutationTags<TPayload> =
  | string[]
  | null
  | ((result: TPayload) => string[] | null);

function resolveCacheOptions(
  cache: CacheOptions | true | undefined,
): CacheOptions | undefined {
  if (cache === true) {
    return { ttl: DEFAULT_CACHE_TTL, sensitiveFields: ['password'] };
  }
  return cache;
}

function resolveLockConfig(
  lock: RepositoryLockConfig | string | true | undefined,
  schemaPath?: string,
  model?: string,
): RepositoryLockConfig | undefined {
  if (lock === true) {
    if (!model) {
      throw new Error(
        '[createRepository] lock: true requires model so table/columns can be resolved',
      );
    }
    return (
      buildLockConfigFromMeta(model) ??
      buildLockConfigFromSchema(model, schemaPath)
    );
  }
  if (typeof lock === 'string') {
    return (
      buildLockConfigFromMeta(lock) ??
      buildLockConfigFromSchema(lock, schemaPath)
    );
  }
  return lock;
}

function resolveScalarFields(
  model: string | undefined,
  scalarFields?: Record<string, string>,
): Record<string, string> | undefined {
  if (scalarFields) return scalarFields;
  if (!model) return undefined;
  const meta = getModelMeta(model);
  return meta ? { ...meta.scalarFields } : undefined;
}

function resolvePrimaryKey(
  model: string | undefined,
  primaryKey?: string,
): string {
  if (primaryKey) return primaryKey;
  if (model) {
    const fromMeta = getModelMeta(model)?.primaryKey;
    if (fromMeta) return fromMeta;
  }
  return 'id';
}

function idWhere(primaryKey: string, id: string): Record<string, string> {
  return { [primaryKey]: id };
}

function resolveGetDelegate(
  model: string | undefined,
  getDelegate?: (client: PrismaClientLike) => PrismaModelDelegate,
): (client: PrismaClientLike) => PrismaModelDelegate {
  if (getDelegate) return getDelegate;
  if (!model) {
    throw new Error(
      '[createRepository] getDelegate is required when model is not set',
    );
  }
  return (client: PrismaClientLike) => {
    const delegate = client[model];
    if (delegate == null || typeof delegate !== 'object') {
      throw new Error(
        `[createRepository] Prisma client has no delegate for model "${model}"`,
      );
    }
    return delegate as PrismaModelDelegate;
  };
}

function resolveToPayload<
  TSelect extends object,
  TToPayload extends <T extends TSelect>(data: unknown) => unknown,
>(toPayload?: TToPayload): TToPayload {
  if (toPayload) return toPayload;
  return ((data: unknown) => data) as TToPayload;
}

export function createRepository<TTypes extends RepoTypesDefinition>(
  options: RepositoryOptionsFromTypes<TTypes>,
): new (deps: RepositoryDeps) => RepositoryApiFromTypes<TTypes>;
export function createRepository<
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
  // Refuse types-bag shapes on this overload so they cannot bind as TSelect
  // (which collapses method returns to `any` in IDEs).
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
  deps: RepositoryDeps,
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
export function createRepository(options: RepositoryOptions<any, any, any, any, any, any, any>) {
  return createRepositoryImpl(options) as any;
}

function createRepositoryImpl<
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
  options: RepositoryOptions<
    TSelect,
    TCreateInput,
    TUpdateInput,
    TWhereInput,
    TOrderBy,
    TToPayload,
    TRepoModel
  >,
) {
  type Payload<T extends TSelect> = InferRepositoryPayload<
    TSelect,
    T,
    TToPayload
  >;

  const cacheOpts = resolveCacheOptions(options.cache);
  const lockConfig = resolveLockConfig(
    options.lock,
    options.schemaPath,
    options.model,
  );
  const getDelegate = resolveGetDelegate(options.model, options.getDelegate);
  const toPayload = resolveToPayload<TSelect, TToPayload>(options.toPayload);
  const scalarFields = resolveScalarFields(options.model, options.scalarFields);
  const primaryKey = resolvePrimaryKey(options.model, options.primaryKey);
  const relationLocalFks = (() => {
    const meta = options.model ? getModelMeta(options.model) : undefined;
    if (!meta) return undefined;
    return Object.fromEntries(
      Object.entries(meta.relations).map(([k, v]) => [k, v.localFields]),
    );
  })();

  const cacheConfigured = !!options.model && !!cacheOpts;
  const defaultTtl = cacheOpts?.ttl ?? 300;
  const defaultNullTtl = cacheOpts?.nullTtl ?? 60;
  const modelName = options.model ?? '';
  const sensitiveFields = cacheOpts?.sensitiveFields ?? ['password'];
  const methodConfig = cacheOpts?.methods ?? {};

  if (lockConfig) {
    validateLockConfig(lockConfig, options.schemaPath);
  }

  if (cacheConfigured) {
    validateCacheConfig(modelName);
  }

  if (scalarFields && !options.model) {
    console.warn(
      '[createRepository] scalarFields without model — auto-compose disabled. Add model to repository config.',
    );
  }

  const getModel = (prisma: PrismaClientLike, tx?: PrismaClientLike) =>
    getDelegate(tx ?? prisma);

  function getMethodTtl(method: CacheMethod): number {
    return methodConfig[method]?.ttl ?? defaultTtl;
  }

  function isMethodEnabled(method: CacheMethod): boolean {
    return methodConfig[method]?.enabled !== false;
  }

  function canUseCache(cache?: CacheAdapter): cache is CacheAdapter {
    return !!cache && cache.isReady();
  }

  function canInvalidate(cache?: CacheAdapter): cache is CacheAdapter {
    return cacheConfigured && canUseCache(cache);
  }

  function shouldCache(
    method: CacheMethod,
    setCache?: boolean,
    tx?: PrismaClientLike,
    select?: object,
  ): boolean {
    if (setCache !== true) return false;
    if (!cacheConfigured) return false;
    if (tx) return false;
    if (!isMethodEnabled(method)) return false;
    if (selectIncludesSensitiveField(select, sensitiveFields)) return false;
    return true;
  }

  function getPrefix(cache: CacheAdapter): string {
    return cache.getPrefix();
  }

  async function acquireLock(
    cache: CacheAdapter,
    cacheKey: string,
  ): Promise<boolean> {
    return cache.safeSetNx(`${cacheKey}:lock`, STAMPEDE_LOCK_TTL);
  }

  async function releaseLock(
    cache: CacheAdapter,
    cacheKey: string,
  ): Promise<void> {
    await cache.safeDel(`${cacheKey}:lock`);
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function cacheGetEntity<T extends TSelect>(
    cache: CacheAdapter,
    id: string,
    method: CacheMethod,
    select?: T,
  ): Promise<{ hit: true; data: Payload<T> | null } | { hit: false }> {
    const key = buildEntityKey({
      prefix: getPrefix(cache),
      model: modelName,
      id,
      method,
      select,
    });
    const raw = await cache.safeGet<unknown>(key);
    if (raw !== null) {
      if (raw === NULL_SENTINEL) return { hit: true, data: null };
      return { hit: true, data: toPayload<T>(raw) as Payload<T> };
    }
    const locked = await acquireLock(cache, key);
    if (!locked) {
      for (let i = 0; i < STAMPEDE_MAX_RETRIES; i++) {
        await sleep(STAMPEDE_RETRY_MS);
        const retry = await cache.safeGet<unknown>(key);
        if (retry !== null) {
          if (retry === NULL_SENTINEL) return { hit: true, data: null };
          return { hit: true, data: toPayload<T>(retry) as Payload<T> };
        }
      }
    }
    return { hit: false };
  }

  async function cacheSetEntity<T extends TSelect>(
    cache: CacheAdapter,
    id: string,
    method: CacheMethod,
    result: unknown,
    select?: T,
  ): Promise<void> {
    const prefix = getPrefix(cache);
    const key = buildEntityKey({
      prefix,
      model: modelName,
      id,
      method,
      select,
    });
    const isNull = result === null || result === undefined;
    const ttl = applyJitter(isNull ? defaultNullTtl : getMethodTtl(method));
    const idxKey = entityIndexKey(prefix, modelName, id);
    await cache.safeSetWithIndex(
      key,
      isNull ? NULL_SENTINEL : result,
      ttl,
      idxKey,
    );
    await releaseLock(cache, key);
  }

  async function cacheGetQuery<TResult>(
    cache: CacheAdapter,
    method: CacheMethod,
    params: Record<string, unknown>,
  ): Promise<{ hit: true; data: TResult | null } | { hit: false }> {
    const key = buildQueryKey({
      prefix: getPrefix(cache),
      model: modelName,
      method,
      params,
    });
    const raw = await cache.safeGet<typeof NULL_SENTINEL | TResult>(key);
    if (raw !== null) {
      if (raw === NULL_SENTINEL) return { hit: true, data: null };
      return { hit: true, data: raw };
    }
    const locked = await acquireLock(cache, key);
    if (!locked) {
      for (let i = 0; i < STAMPEDE_MAX_RETRIES; i++) {
        await sleep(STAMPEDE_RETRY_MS);
        const retry = await cache.safeGet<typeof NULL_SENTINEL | TResult>(key);
        if (retry !== null) {
          if (retry === NULL_SENTINEL) return { hit: true, data: null };
          return { hit: true, data: retry };
        }
      }
    }
    return { hit: false };
  }

  async function registerQueryWithTags(
    cache: CacheAdapter,
    key: string,
    ttlSeconds: number,
    tags: string[],
  ): Promise<void> {
    const prefix = getPrefix(cache);
    await Promise.all(
      tags.map((tag) => {
        const idxKey = `${prefix}:repo:${modelName}:t:${tag}:__idx`;
        return cache.safeSaddAndExpire(idxKey, [key], ttlSeconds);
      }),
    );
  }

  async function cacheSetQuery(
    cache: CacheAdapter,
    method: CacheMethod,
    params: Record<string, unknown>,
    result: unknown,
    tags?: string[],
  ): Promise<void> {
    const prefix = getPrefix(cache);
    const key = buildQueryKey({ prefix, model: modelName, method, params });
    const isNull = result === null || result === undefined;
    const ttl = applyJitter(isNull ? defaultNullTtl : getMethodTtl(method));

    if (tags && tags.length > 0) {
      await cache.safeSet(key, isNull ? NULL_SENTINEL : result, ttl);
      await registerQueryWithTags(cache, key, ttl, tags);
    } else {
      const idxKey = queryIndexKey(prefix, modelName);
      await cache.safeSetWithIndex(
        key,
        isNull ? NULL_SENTINEL : result,
        ttl,
        idxKey,
      );
    }
    await releaseLock(cache, key);
  }

  async function doInvalidateEntity(
    cache: CacheAdapter,
    id: string,
  ): Promise<void> {
    await cache.safeInvalidateByIndex(
      entityIndexKey(getPrefix(cache), modelName, id),
    );
  }

  async function doInvalidateQueries(cache: CacheAdapter): Promise<void> {
    await cache.safeInvalidateByIndex(
      queryIndexKey(getPrefix(cache), modelName),
    );
  }

  async function doInvalidateTags(
    cache: CacheAdapter,
    tags: string[],
  ): Promise<void> {
    const prefix = getPrefix(cache);
    const keysToDelete: string[] = [];
    const idxKeysToDelete: string[] = [];

    await Promise.all(
      tags.map(async (tag) => {
        const idxKey = `${prefix}:repo:${modelName}:t:${tag}:__idx`;
        const keys = await cache.safeSmembers(idxKey);
        if (keys.length > 0) keysToDelete.push(...keys);
        idxKeysToDelete.push(idxKey);
      }),
    );

    if (keysToDelete.length > 0) {
      await cache.safeDel(...new Set(keysToDelete), ...idxKeysToDelete);
    } else if (idxKeysToDelete.length > 0) {
      await cache.safeDel(...idxKeysToDelete);
    }
  }

  async function runInvalidation(
    cache: CacheAdapter,
    mode: InvalidateMode,
    id?: string,
    tags?: string[] | null,
  ): Promise<void> {
    if (Array.isArray(tags) && tags.length > 0) {
      if (id) await doInvalidateEntity(cache, id);
      await Promise.all([
        doInvalidateTags(cache, tags),
        doInvalidateQueries(cache),
      ]);
      return;
    }

    switch (mode) {
      case 'all':
        if (id) await doInvalidateEntity(cache, id);
        await doInvalidateQueries(cache);
        break;
      case 'entity':
        if (id) await doInvalidateEntity(cache, id);
        break;
      case 'queries':
        await doInvalidateQueries(cache);
        break;
      case 'none':
        break;
    }
  }

  function resolveTags(
    where: unknown,
    cacheTags?: string[] | ((where?: unknown) => string[]),
  ): string[] | undefined {
    if (!cacheTags) return undefined;
    return typeof cacheTags === 'function' ? cacheTags(where) : cacheTags;
  }

  class Repository {
    constructor(readonly deps: RepositoryDeps) {
      if (options.model && this.deps.registry) {
        this.deps.registry.register(options.model, {
          repository: this,
          scalarFields,
        });
      }
    }

    get prisma(): PrismaClientLike {
      return this.deps.prisma;
    }

    get cache(): CacheAdapter | undefined {
      return this.deps.cache;
    }

    async processSelectAndCompose(
      select: any,
      queryFn: (dbSelect: any) => Promise<any>,
    ): Promise<any> {
      if (!select || !scalarFields) {
        return queryFn(select);
      }

      const { dbSelect, relations } = splitSelect(
        select,
        scalarFields,
        relationLocalFks,
      );
      const result = await queryFn(dbSelect);

      if (
        this.deps.autoCompose &&
        options.model &&
        result &&
        Object.keys(relations).length > 0
      ) {
        if (result.data && Array.isArray(result.data)) {
          result.data = await this.deps.autoCompose.composeMany(
            result.data,
            relations,
            options.model,
          );
        } else if (Array.isArray(result)) {
          return this.deps.autoCompose.composeMany(
            result,
            relations,
            options.model,
          );
        } else {
          return this.deps.autoCompose.composeOne(
            result,
            relations,
            options.model,
          );
        }
      }

      return result;
    }

    async invalidateCache(opts?: {
      id?: string;
      tags?: string[];
    }): Promise<void> {
      if (!canInvalidate(this.deps.cache)) return;
      if (opts?.id) await doInvalidateEntity(this.deps.cache, opts.id);
      if (opts?.tags && opts.tags.length > 0) {
        await doInvalidateTags(this.deps.cache, opts.tags);
      }
      await doInvalidateQueries(this.deps.cache);
    }

    async create<T extends TSelect>({
      tx,
      data,
      select,
      invalidate = 'queries',
      tags,
    }: {
      tx?: PrismaClientLike;
      data: TCreateInput;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>>;
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(select, async (dbSelect) => {
        const result = await getModel(this.deps.prisma, tx).create({
          data,
          select: dbSelect,
        });
        if (!tx && canInvalidate(this.deps.cache)) {
          const resolvedTags =
            typeof tags === 'function'
              ? tags(toPayload<T>(result) as Payload<T>)
              : tags;
          await runInvalidation(
            this.deps.cache,
            invalidate,
            undefined,
            resolvedTags ?? undefined,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      });
    }

    async getById<T extends TSelect>(params: {
      id: string;
      select?: T;
      tx?: PrismaClientLike;
      lock?: RowLockOptions;
      setCache?: boolean;
    }): Promise<Payload<T> | null> {
      const { tx, id, select, setCache, lock } = params;
      return this.processSelectAndCompose(select, async (dbSelect) => {
        if (lock) {
          assertLockPrerequisites(tx, lockConfig);
          const result = await queryRowForUpdate(tx as any, lockConfig, {
            id,
            select: dbSelect,
            lock,
            idColumn: primaryKey,
          });
          return toPayload<T>(result) as Payload<T>;
        }

        const useCache =
          shouldCache('getById', setCache, tx, dbSelect) &&
          canUseCache(this.deps.cache);

        if (useCache) {
          const cached = await cacheGetEntity<T>(
            this.deps.cache!,
            id,
            'getById',
            dbSelect,
          );
          if (cached.hit) {
            recordCacheDebug('getById', 'HIT', modelName);
            return cached.data as Payload<T>;
          }
          recordCacheDebug('getById', 'MISS', modelName);
        } else if (setCache === true && !cacheConfigured) {
          recordCacheDebug('getById', 'BYPASS', 'repo not configured');
        } else if (
          setCache === true &&
          selectIncludesSensitiveField(dbSelect, sensitiveFields)
        ) {
          recordCacheDebug('getById', 'BYPASS', 'sensitive select');
        }

        const result = await getModel(this.deps.prisma, tx).findUnique({
          where: idWhere(primaryKey, id),
          select: dbSelect,
        });
        if (useCache) {
          await cacheSetEntity(
            this.deps.cache!,
            id,
            'getById',
            result,
            dbSelect,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      });
    }

    async getThrowById<T extends TSelect>(params: {
      id: string;
      select?: T;
      tx?: PrismaClientLike;
      lock?: RowLockOptions;
      setCache?: boolean;
    }): Promise<Payload<T>> {
      const { tx, id, select, setCache, lock } = params;
      return this.processSelectAndCompose(select, async (dbSelect) => {
        if (lock) {
          assertLockPrerequisites(tx, lockConfig);
          const result = await queryRowForUpdate(tx as any, lockConfig, {
            id,
            select: dbSelect,
            lock,
            idColumn: primaryKey,
          });
          if (result === null) {
            await getModel(this.deps.prisma, tx).findUniqueOrThrow({
              where: idWhere(primaryKey, id),
              select: dbSelect,
            });
          }
          return toPayload<T>(result) as Payload<T>;
        }

        const useCache =
          shouldCache('getThrowById', setCache, tx, dbSelect) &&
          canUseCache(this.deps.cache);

        if (useCache) {
          const cached = await cacheGetEntity<T>(
            this.deps.cache!,
            id,
            'getThrowById',
            dbSelect,
          );
          if (cached.hit) {
            recordCacheDebug('getThrowById', 'HIT', modelName);
            if (cached.data === null) {
              await getModel(this.deps.prisma, tx).findUniqueOrThrow({
                where: idWhere(primaryKey, id),
                select: dbSelect,
              });
            }
            return cached.data as Payload<T>;
          }
          recordCacheDebug('getThrowById', 'MISS', modelName);
        } else if (setCache === true && !cacheConfigured) {
          recordCacheDebug('getThrowById', 'BYPASS', 'repo not configured');
        }

        const result = await getModel(this.deps.prisma, tx).findUniqueOrThrow({
          where: idWhere(primaryKey, id),
          select: dbSelect,
        });
        if (useCache) {
          await cacheSetEntity(
            this.deps.cache!,
            id,
            'getThrowById',
            result,
            dbSelect,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      });
    }

    async getFirst<T extends TSelect>({
      tx,
      where,
      select,
      setCache,
      cacheTags,
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      select?: T;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
    }): Promise<Payload<T> | null> {
      return this.processSelectAndCompose(select, async (dbSelect) => {
        const params = { where, select: dbSelect } as Record<string, unknown>;
        const useCache =
          shouldCache('getFirst', setCache, tx, dbSelect) &&
          canUseCache(this.deps.cache);

        if (useCache) {
          const cached = await cacheGetQuery<unknown>(
            this.deps.cache!,
            'getFirst',
            params,
          );
          if (cached.hit) {
            recordCacheDebug('getFirst', 'HIT', modelName);
            return toPayload<T>(cached.data) as Payload<T>;
          }
          recordCacheDebug('getFirst', 'MISS', modelName);
        }

        const result = await getModel(this.deps.prisma, tx).findFirst({
          where,
          select: dbSelect,
        });
        if (useCache) {
          const resolvedTags = resolveTags(where, cacheTags as any);
          await cacheSetQuery(
            this.deps.cache!,
            'getFirst',
            params,
            result,
            resolvedTags,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      });
    }

    async getMany<T extends TSelect>({
      tx,
      where,
      select,
      orderBy,
      take,
      skip,
      setCache,
      cacheTags,
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      take?: number;
      skip?: number;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
    }): Promise<Payload<T>[]> {
      return this.processSelectAndCompose(select, async (dbSelect) => {
        const params = {
          where,
          select: dbSelect,
          orderBy,
          take,
          skip,
        } as Record<string, unknown>;
        const useCache =
          shouldCache('getMany', setCache, tx, dbSelect) &&
          canUseCache(this.deps.cache);

        if (useCache) {
          const cached = await cacheGetQuery<unknown[]>(
            this.deps.cache!,
            'getMany',
            params,
          );
          if (cached.hit) {
            recordCacheDebug('getMany', 'HIT', modelName);
            return cached.data!.map(
              (item) => toPayload<T>(item) as Payload<T>,
            );
          }
          recordCacheDebug('getMany', 'MISS', modelName);
        }

        const results = await getModel(this.deps.prisma, tx).findMany({
          where,
          select: dbSelect,
          orderBy,
          take,
          skip,
        });
        if (useCache) {
          const resolvedTags = resolveTags(where, cacheTags as any);
          await cacheSetQuery(
            this.deps.cache!,
            'getMany',
            params,
            results,
            resolvedTags,
          );
        }
        return results.map((item) => toPayload<T>(item) as Payload<T>);
      });
    }

    async getManyPaginate<T extends TSelect>({
      tx,
      where,
      select,
      orderBy,
      page = 1,
      pageSize = 25,
      setCache,
      cacheTags,
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      page?: number;
      pageSize?: number;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
    }): Promise<PaginatedResult<Payload<T>>> {
      return this.processSelectAndCompose(select, async (dbSelect) => {
        const params = {
          where,
          select: dbSelect,
          orderBy,
          page,
          pageSize,
        } as Record<string, unknown>;
        const useCache =
          shouldCache('getManyPaginate', setCache, tx, dbSelect) &&
          canUseCache(this.deps.cache);

        if (useCache) {
          const cached = await cacheGetQuery<PaginatedResult<Payload<T>>>(
            this.deps.cache!,
            'getManyPaginate',
            params,
          );
          if (cached.hit) {
            recordCacheDebug('getManyPaginate', 'HIT', modelName);
            return cached.data as PaginatedResult<Payload<T>>;
          }
          recordCacheDebug('getManyPaginate', 'MISS', modelName);
        }

        const result = (await paginate(
          getModel(this.deps.prisma, tx),
          { where, select: dbSelect, orderBy },
          { page, perPage: pageSize },
        )) as PaginatedResult<Payload<T>>;
        if (useCache) {
          const resolvedTags = resolveTags(where, cacheTags as any);
          await cacheSetQuery(
            this.deps.cache!,
            'getManyPaginate',
            params,
            result,
            resolvedTags,
          );
        }
        return result;
      });
    }

    async updateById<T extends TSelect>({
      tx,
      id,
      data,
      select,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      id: string;
      data: TUpdateInput;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>>;
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(select, async (dbSelect) => {
        const result = await getModel(this.deps.prisma, tx).update({
          where: idWhere(primaryKey, id),
          data,
          select: dbSelect,
        });
        if (!tx && canInvalidate(this.deps.cache)) {
          const resolvedTags =
            typeof tags === 'function'
              ? tags(toPayload<T>(result) as Payload<T>)
              : tags;
          await runInvalidation(
            this.deps.cache,
            invalidate,
            id,
            resolvedTags ?? undefined,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      });
    }

    async deleteById<T extends TSelect>({
      tx,
      id,
      select,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      id: string;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>>;
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(select, async (dbSelect) => {
        const result = await getModel(this.deps.prisma, tx).delete({
          where: idWhere(primaryKey, id),
          select: dbSelect,
        });
        if (!tx && canInvalidate(this.deps.cache)) {
          const resolvedTags =
            typeof tags === 'function'
              ? tags(toPayload<T>(result) as Payload<T>)
              : tags;
          await runInvalidation(
            this.deps.cache,
            invalidate,
            id,
            resolvedTags ?? undefined,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      });
    }
  }

  return Repository;
}

export type RepositoryInstance<
  TSelect extends object = object,
  TCreateInput = unknown,
  TUpdateInput = unknown,
  TWhereInput = unknown,
  TOrderBy = unknown,
  TToPayload extends <T extends TSelect>(
    data: unknown,
  ) => unknown = DefaultToPayload<TSelect>,
  TRepoModel extends string = never,
> = InstanceType<
  ReturnType<
    typeof createRepositoryImpl<
      TSelect,
      TCreateInput,
      TUpdateInput,
      TWhereInput,
      TOrderBy,
      TToPayload,
      TRepoModel
    >
  >
>;

/**
 * Instance type for the strong {@link RepoTypesDefinition} API.
 * Explicit {@link RepositoryApiFromTypes} — not `InstanceType` of the impl.
 */
export type RepositoryInstanceFromTypes<TTypes extends RepoTypesDefinition> =
  RepositoryApiFromTypes<TTypes>;

export type { RepositoryApiFromTypes, RepositoryCtorFromTypes };

/** Alias matching myrpc-be naming for easier migration. */
export const createPrismaRepository = createRepository;
export type PrismaRepositoryInstance<
  TSelect extends object = object,
  TCreateInput = unknown,
  TUpdateInput = unknown,
  TWhereInput = unknown,
  TOrderBy = unknown,
  TToPayload extends <T extends TSelect>(
    data: unknown,
  ) => unknown = DefaultToPayload<TSelect>,
  TRepoModel extends string = never,
> = RepositoryInstance<
  TSelect,
  TCreateInput,
  TUpdateInput,
  TWhereInput,
  TOrderBy,
  TToPayload,
  TRepoModel
>;
