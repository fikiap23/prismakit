import type { CacheAdapter } from './cache/cache-adapter.interface';
import { validateCacheConfig } from './cache/validate-cache-config';
import {
  buildEntityKey,
  buildQueryKey,
  entityIndexKey,
  entityAllIndexKey,
  queryIndexKey,
} from './cache/cache-key.util';
import { selectIncludesSensitiveField } from './cache/cache-guard.util';
import { applyJitter } from './cache/ttl-jitter.util';
import { recordCacheDebug } from './cache/cache-debug.util';
import { singleflight } from './cache/singleflight';
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
import type { HasCacheFromOptions } from './types/repository-api-typemap.type';
import type { RepoTypesDefinition, RepoPayloadHKT } from './types/repo-types.type';
import {
  resolveStampedeOptions,
  stampedeWaitMs,
} from './types/stampede-options.type';
import {
  assertLockPrerequisites,
  queryRowForUpdate,
  queryRowsForUpdate,
} from './lock/row-lock';
import { validateLockConfig } from './lock/validate-lock-config';
import {
  buildLockConfigFromMeta,
  buildLockConfigFromSchema,
} from './lock/build-lock-config';
import { paginator, type PaginateFunction } from './pagination/paginator';
import { splitSelect } from './utils/split-select';
import { AutoComposer, ensureSelectPrimaryKey } from './auto-composer';
import { RepositoryRegistry } from './repository-registry';
import { ensurePrismaMeta, getModelMeta } from './schema/prisma-meta';
import { emitTelemetry } from './telemetry/telemetry';
import type { ComposeOptions } from './compose/compose-options';

const paginate: PaginateFunction = paginator({});

const NULL_SENTINEL = '__NULL__';
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
   * Primary key field(s) for `*ById` / row locks.
   * Defaults to Prisma meta PK or `id`. Pass an array for composite PKs.
   */
  primaryKey?: string | string[];
};

/**
 * Options when using the strong {@link RepoTypesDefinition} API.
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
  | undefined
  | ((result: TPayload) => string[] | null | undefined);

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
  primaryKey?: string | string[],
): string | string[] {
  if (primaryKey) return primaryKey;
  if (model) {
    const fromMeta = getModelMeta(model)?.primaryKey;
    if (fromMeta) return fromMeta;
  }
  return 'id';
}

function idWhere(
  primaryKey: string | string[],
  id: string | Record<string, string>,
): Record<string, string> {
  if (Array.isArray(primaryKey)) {
    if (typeof id === 'string') {
      throw new Error(
        `[createRepository] composite primaryKey [${primaryKey.join(', ')}] requires id as object`,
      );
    }
    return { ...id };
  }
  if (typeof id === 'object') {
    return id;
  }
  return { [primaryKey]: id };
}

function idCacheKey(
  primaryKey: string | string[],
  id: string | Record<string, string>,
): string {
  if (typeof id === 'string') return id;
  const keys = Array.isArray(primaryKey) ? primaryKey : Object.keys(id).sort();
  return keys.map((k) => `${k}=${id[k]}`).join('|');
}

function extractEntityIdFromRow(
  row: unknown,
  primaryKey: string | string[],
): string | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const record = row as Record<string, unknown>;
  if (Array.isArray(primaryKey)) {
    if (!primaryKey.every((k) => record[k] != null)) return undefined;
    return primaryKey.map((k) => `${k}=${String(record[k])}`).join('|');
  }
  if (record[primaryKey] == null) return undefined;
  return String(record[primaryKey]);
}

/**
 * Deep-ish clone before AutoComposer mutates rows in place.
 * Protects cache adapters that return stored objects by reference.
 */
function cloneForCompose<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through for non-cloneable values
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
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

export function createRepository<
  TTypes extends RepoTypesDefinition,
  const O extends RepositoryOptionsFromTypes<TTypes>,
>(
  options: O,
): new (
  deps: RepositoryDeps,
) => RepositoryApiFromTypes<TTypes, HasCacheFromOptions<O>>;
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

/** Preferred alias — same as {@link createRepository}. */
export const defineRepository = createRepository;

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

  ensurePrismaMeta({ schemaPath: options.schemaPath });

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
  const defaultSetCache = cacheOpts?.defaultSetCache === true;
  const stampedeOpts = resolveStampedeOptions(cacheOpts?.stampede);

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

  function resolveSetCache(setCache?: boolean): boolean | undefined {
    if (setCache !== undefined) return setCache;
    return defaultSetCache ? true : undefined;
  }

  function shouldCache(
    method: CacheMethod,
    setCache?: boolean,
    tx?: PrismaClientLike,
    select?: object,
  ): boolean {
    const effective = resolveSetCache(setCache);
    if (effective !== true) return false;
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
    return cache.safeSetNx(`${cacheKey}:lock`, stampedeOpts.lockTtl);
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

  async function waitForStampede<T>(
    cache: CacheAdapter,
    key: string,
    read: () => Promise<T | null | typeof NULL_SENTINEL | unknown>,
  ): Promise<{ hit: true; data: unknown } | { hit: false }> {
    const started = Date.now();
    let waited = 0;
    for (let i = 0; i < stampedeOpts.maxRetries; i++) {
      const wait = stampedeWaitMs(stampedeOpts, i);
      if (waited + wait > stampedeOpts.totalTimeoutMs) break;
      await sleep(wait);
      waited += wait;
      const retry = await read();
      if (retry !== null) {
        emitTelemetry({
          type: 'stampede.waited',
          model: modelName,
          key,
          retries: i + 1,
          durationMs: Date.now() - started,
        });
        return { hit: true, data: retry };
      }
    }
    emitTelemetry({
      type: 'stampede.fallthrough',
      model: modelName,
      key,
      retries: stampedeOpts.maxRetries,
      durationMs: Date.now() - started,
    });
    return { hit: false };
  }

  async function cacheGetEntity<T extends TSelect>(
    cache: CacheAdapter,
    id: string | Record<string, string>,
    method: CacheMethod,
    select?: T,
  ): Promise<{ hit: true; data: Payload<T> | null } | { hit: false }> {
    const idKey = idCacheKey(primaryKey, id);
    const key = buildEntityKey({
      prefix: getPrefix(cache),
      model: modelName,
      id: idKey,
      method,
      select,
    });

    return singleflight(`entity:${key}`, async () => {
      const raw = await cache.safeGet<unknown>(key);
      if (raw !== null) {
        if (raw === NULL_SENTINEL) return { hit: true as const, data: null };
        return {
          hit: true as const,
          data: toPayload<T>(raw) as Payload<T>,
        };
      }
      const locked = await acquireLock(cache, key);
      if (!locked) {
        emitTelemetry({ type: 'stampede.locked', model: modelName, key });
        const waited = await waitForStampede(cache, key, () =>
          cache.safeGet<unknown>(key),
        );
        if (waited.hit) {
          if (waited.data === NULL_SENTINEL) {
            return { hit: true as const, data: null };
          }
          return {
            hit: true as const,
            data: toPayload<T>(waited.data) as Payload<T>,
          };
        }
      }
      return { hit: false as const };
    });
  }

  async function cacheSetEntity<T extends TSelect>(
    cache: CacheAdapter,
    id: string | Record<string, string>,
    method: CacheMethod,
    result: unknown,
    select?: T,
  ): Promise<void> {
    const idKey = idCacheKey(primaryKey, id);
    const prefix = getPrefix(cache);
    const key = buildEntityKey({
      prefix,
      model: modelName,
      id: idKey,
      method,
      select,
    });
    const isNull = result === null || result === undefined;
    const ttl = applyJitter(isNull ? defaultNullTtl : getMethodTtl(method));
    const idxKey = entityIndexKey(prefix, modelName, idKey);
    await cache.safeSetWithIndex(
      key,
      isNull ? NULL_SENTINEL : result,
      ttl,
      idxKey,
    );
    // Track entity index under model-wide set for invalidate:'all' without id
    await cache.safeSaddAndExpire(
      entityAllIndexKey(prefix, modelName),
      [idxKey],
      ttl + 60,
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

    return singleflight(`query:${key}`, async () => {
      const raw = await cache.safeGet<typeof NULL_SENTINEL | TResult>(key);
      if (raw !== null) {
        if (raw === NULL_SENTINEL) return { hit: true as const, data: null };
        return { hit: true as const, data: raw };
      }
      const locked = await acquireLock(cache, key);
      if (!locked) {
        emitTelemetry({ type: 'stampede.locked', model: modelName, key });
        const waited = await waitForStampede(cache, key, () =>
          cache.safeGet<typeof NULL_SENTINEL | TResult>(key),
        );
        if (waited.hit) {
          if (waited.data === NULL_SENTINEL) {
            return { hit: true as const, data: null };
          }
          return { hit: true as const, data: waited.data as TResult };
        }
      }
      return { hit: false as const };
    });
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
      // Also register in the model query index so default mutations clear tags
      await cache.safeSaddAndExpire(
        queryIndexKey(prefix, modelName),
        [key],
        ttl + 60,
      );
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
    const idxKey = entityIndexKey(getPrefix(cache), modelName, id);
    await cache.safeInvalidateByIndex(idxKey);
    await cache.safeDel(`__setmeta:${idxKey}`);
    emitTelemetry({
      type: 'cache.invalidate',
      model: modelName,
      detail: `entity:${id}`,
    });
  }

  async function doInvalidateQueries(cache: CacheAdapter): Promise<void> {
    await cache.safeInvalidateByIndex(
      queryIndexKey(getPrefix(cache), modelName),
    );
    emitTelemetry({
      type: 'cache.invalidate',
      model: modelName,
      detail: 'queries',
    });
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

  async function doInvalidateAllEntities(cache: CacheAdapter): Promise<void> {
    const allIdx = entityAllIndexKey(getPrefix(cache), modelName);
    const entityIdxKeys = await cache.safeSmembers(allIdx);
    await Promise.all(
      entityIdxKeys.map((idxKey) => cache.safeInvalidateByIndex(idxKey)),
    );
    await cache.safeDel(allIdx, `__setmeta:${allIdx}`);
    emitTelemetry({
      type: 'cache.invalidate',
      model: modelName,
      detail: 'entities:all',
    });
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
        else await doInvalidateAllEntities(cache);
        await doInvalidateQueries(cache);
        break;
      case 'entity':
        if (id) await doInvalidateEntity(cache, id);
        else await doInvalidateAllEntities(cache);
        break;
      case 'queries':
        await doInvalidateQueries(cache);
        break;
      case 'stale':
        // Soft invalidation: still purge entity + queries (SWR can be layered
        // by adapters; core treats stale like entity+queries for safety).
        if (id) await doInvalidateEntity(cache, id);
        else await doInvalidateAllEntities(cache);
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

  function timedQuery<T>(
    method: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    return fn().then((result) => {
      const durationMs = Date.now() - started;
      emitTelemetry({
        type: 'query.complete',
        model: modelName,
        method,
        durationMs,
      });
      return result;
    });
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
      composeCtx?: Pick<ComposeOptions, 'setCache' | 'tx'>,
    ): Promise<any> {
      if (!select || !scalarFields) {
        return queryFn(select);
      }

      const { dbSelect: splitDb, relations } = splitSelect(
        select,
        scalarFields,
        relationLocalFks,
      );

      let dbSelect = splitDb as Record<string, any>;
      // Inject root PK whenever relations need mapping back onto parents
      if (Object.keys(relations).length > 0) {
        dbSelect = ensureSelectPrimaryKey(
          dbSelect,
          primaryKey,
          scalarFields,
        ) as Record<string, any>;
      }

      const result = await queryFn(dbSelect);

      if (
        this.deps.autoCompose &&
        options.model &&
        result &&
        Object.keys(relations).length > 0
      ) {
        // Clone before in-place compose so cache hits / shared refs are not mutated
        const composeTarget = cloneForCompose(result);
        const composeOpts: ComposeOptions = {
          // Parent setCache:false / tx must win over global compose default
          setCache: composeCtx?.tx
            ? false
            : composeCtx?.setCache === false
              ? false
              : undefined,
          tx: composeCtx?.tx,
        };
        if (composeTarget.data && Array.isArray(composeTarget.data)) {
          composeTarget.data = await this.deps.autoCompose.composeMany(
            composeTarget.data,
            relations,
            options.model,
            composeOpts,
          );
          return composeTarget;
        } else if (Array.isArray(composeTarget)) {
          return this.deps.autoCompose.composeMany(
            composeTarget,
            relations,
            options.model,
            composeOpts,
          );
        } else {
          return this.deps.autoCompose.composeOne(
            composeTarget,
            relations,
            options.model,
            composeOpts,
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
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
        const result = await timedQuery('create', () =>
          getModel(this.deps.prisma, tx).create({
            data,
            select: dbSelect,
          }),
        );
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
      },
        { tx, setCache: false },
      );
    }

    async createMany({
      tx,
      data,
      skipDuplicates,
      invalidate = 'queries',
      tags,
    }: {
      tx?: PrismaClientLike;
      data: TCreateInput[];
      skipDuplicates?: boolean;
      invalidate?: InvalidateMode;
      tags?: MutationTags<unknown>;
    }): Promise<{ count: number }> {
      const delegate = getModel(this.deps.prisma, tx);
      if (!delegate.createMany) {
        throw new Error(
          `[createRepository] model "${modelName}" does not support createMany`,
        );
      }
      const result = await timedQuery('createMany', () =>
        delegate.createMany!({ data, skipDuplicates }),
      );
      if (!tx && canInvalidate(this.deps.cache)) {
        const resolvedTags = typeof tags === 'function' ? tags(result) : tags;
        await runInvalidation(
          this.deps.cache,
          invalidate,
          undefined,
          resolvedTags ?? undefined,
        );
      }
      return result;
    }

    async getById<T extends TSelect>(params: {
      id: string | Record<string, string>;
      select?: T;
      tx?: PrismaClientLike;
      lock?: RowLockOptions;
      setCache?: boolean;
    }): Promise<Payload<T> | null> {
      const { tx, id, select, setCache, lock } = params;
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          if (lock) {
            assertLockPrerequisites(tx, lockConfig);
            const result = await queryRowForUpdate(tx as any, lockConfig, {
              id,
              select: dbSelect,
              lock,
              idColumn: primaryKey,
            });
            emitTelemetry({
              type: 'lock.acquired',
              model: modelName,
              mode: lock.mode,
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
              emitTelemetry({
                type: 'cache.hit',
                model: modelName,
                method: 'getById',
              });
              return cached.data as Payload<T>;
            }
            recordCacheDebug('getById', 'MISS', modelName);
            emitTelemetry({
              type: 'cache.miss',
              model: modelName,
              method: 'getById',
            });
          } else if (resolveSetCache(setCache) === true && !cacheConfigured) {
            recordCacheDebug('getById', 'BYPASS', 'repo not configured');
          } else if (
            resolveSetCache(setCache) === true &&
            selectIncludesSensitiveField(dbSelect, sensitiveFields)
          ) {
            recordCacheDebug('getById', 'BYPASS', 'sensitive select');
          }

          try {
            const result = await timedQuery('getById', () =>
              getModel(this.deps.prisma, tx).findUnique({
                where: idWhere(primaryKey, id),
                select: dbSelect,
              }),
            );
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
          } catch (err) {
            if (useCache) {
              const key = buildEntityKey({
                prefix: getPrefix(this.deps.cache!),
                model: modelName,
                id: idCacheKey(primaryKey, id),
                method: 'getById',
                select: dbSelect,
              });
              await releaseLock(this.deps.cache!, key);
            }
            throw err;
          }
        },
        { tx, setCache },
      );
    }

    async getThrowById<T extends TSelect>(params: {
      id: string | Record<string, string>;
      select?: T;
      tx?: PrismaClientLike;
      lock?: RowLockOptions;
      setCache?: boolean;
    }): Promise<Payload<T>> {
      const { tx, id, select, setCache, lock } = params;
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          if (lock) {
            assertLockPrerequisites(tx, lockConfig);
            const result = await queryRowForUpdate(tx as any, lockConfig, {
              id,
              select: dbSelect,
              lock,
              idColumn: primaryKey,
            });
            if (result === null) {
              // skipLocked / missing row: fall back to findUniqueOrThrow and
              // return THAT row (never discard into null).
              const fallback = await getModel(
                this.deps.prisma,
                tx,
              ).findUniqueOrThrow({
                where: idWhere(primaryKey, id),
                select: dbSelect,
              });
              emitTelemetry({
                type: 'lock.acquired',
                model: modelName,
                mode: lock.mode,
              });
              return toPayload<T>(fallback) as Payload<T>;
            }
            emitTelemetry({
              type: 'lock.acquired',
              model: modelName,
              mode: lock.mode,
            });
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
              emitTelemetry({
                type: 'cache.hit',
                model: modelName,
                method: 'getThrowById',
              });
              if (cached.data === null) {
                await getModel(this.deps.prisma, tx).findUniqueOrThrow({
                  where: idWhere(primaryKey, id),
                  select: dbSelect,
                });
              }
              return cached.data as Payload<T>;
            }
            recordCacheDebug('getThrowById', 'MISS', modelName);
            emitTelemetry({
              type: 'cache.miss',
              model: modelName,
              method: 'getThrowById',
            });
          } else if (resolveSetCache(setCache) === true && !cacheConfigured) {
            recordCacheDebug('getThrowById', 'BYPASS', 'repo not configured');
          }

          try {
            const result = await timedQuery('getThrowById', () =>
              getModel(this.deps.prisma, tx).findUniqueOrThrow({
                where: idWhere(primaryKey, id),
                select: dbSelect,
              }),
            );
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
          } catch (err) {
            if (useCache) {
              const key = buildEntityKey({
                prefix: getPrefix(this.deps.cache!),
                model: modelName,
                id: idCacheKey(primaryKey, id),
                method: 'getThrowById',
                select: dbSelect,
              });
              await releaseLock(this.deps.cache!, key);
            }
            throw err;
          }
        },
        { tx, setCache },
      );
    }

    async getFirst<T extends TSelect>({
      tx,
      where,
      select,
      setCache,
      cacheTags,
      lock,
      orderBy,
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      select?: T;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
      lock?: RowLockOptions;
      orderBy?: TOrderBy;
    }): Promise<Payload<T> | null> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
        if (lock) {
          assertLockPrerequisites(tx, lockConfig);
          if (!where || typeof where !== 'object') {
            throw new Error('Row lock on getFirst requires a simple where object');
          }
          const rows = await queryRowsForUpdate(tx as any, lockConfig, {
            where: where as Record<string, unknown>,
            select: dbSelect,
            lock,
            take: 1,
            orderBy,
          });
          emitTelemetry({
            type: 'lock.acquired',
            model: modelName,
            mode: lock.mode,
          });
          return toPayload<T>(rows[0] ?? null) as Payload<T>;
        }

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
            emitTelemetry({
              type: 'cache.hit',
              model: modelName,
              method: 'getFirst',
            });
            return toPayload<T>(cached.data) as Payload<T>;
          }
          recordCacheDebug('getFirst', 'MISS', modelName);
          emitTelemetry({
            type: 'cache.miss',
            model: modelName,
            method: 'getFirst',
          });
        }

        const result = await timedQuery('getFirst', () =>
          getModel(this.deps.prisma, tx).findFirst({
            where,
            select: dbSelect,
          }),
        );
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
      },
        { tx, setCache },
      );
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
      lock,
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      take?: number;
      skip?: number;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
      lock?: RowLockOptions;
    }): Promise<Payload<T>[]> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
        if (lock) {
          assertLockPrerequisites(tx, lockConfig);
          if (!where || typeof where !== 'object') {
            throw new Error('Row lock on getMany requires a simple where object');
          }
          if (skip) {
            throw new Error('Row lock on getMany does not support skip');
          }
          const rows = await queryRowsForUpdate(tx as any, lockConfig, {
            where: where as Record<string, unknown>,
            select: dbSelect,
            lock,
            take,
            orderBy,
          });
          emitTelemetry({
            type: 'lock.acquired',
            model: modelName,
            mode: lock.mode,
          });
          return rows.map((item) => toPayload<T>(item) as Payload<T>);
        }

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
            emitTelemetry({
              type: 'cache.hit',
              model: modelName,
              method: 'getMany',
            });
            return cached.data!.map(
              (item) => toPayload<T>(item) as Payload<T>,
            );
          }
          recordCacheDebug('getMany', 'MISS', modelName);
          emitTelemetry({
            type: 'cache.miss',
            model: modelName,
            method: 'getMany',
          });
        }

        const results = await timedQuery('getMany', () =>
          getModel(this.deps.prisma, tx).findMany({
            where,
            select: dbSelect,
            orderBy,
            take,
            skip,
          }),
        );
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
      },
        { tx, setCache },
      );
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
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
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
          const cached = await cacheGetQuery<PaginatedResult<unknown>>(
            this.deps.cache!,
            'getManyPaginate',
            params,
          );
          if (cached.hit) {
            recordCacheDebug('getManyPaginate', 'HIT', modelName);
            emitTelemetry({
              type: 'cache.hit',
              model: modelName,
              method: 'getManyPaginate',
            });
            const data = (cached.data?.data ?? []).map(
              (item) => toPayload<T>(item) as Payload<T>,
            );
            return {
              ...(cached.data as PaginatedResult<Payload<T>>),
              data,
            };
          }
          recordCacheDebug('getManyPaginate', 'MISS', modelName);
          emitTelemetry({
            type: 'cache.miss',
            model: modelName,
            method: 'getManyPaginate',
          });
        }

        const result = (await timedQuery('getManyPaginate', () =>
          paginate(
            getModel(this.deps.prisma, tx),
            { where, select: dbSelect, orderBy },
            { page, perPage: pageSize },
          ),
        )) as PaginatedResult<unknown>;

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

        return {
          ...result,
          data: result.data.map((item) => toPayload<T>(item) as Payload<T>),
        } as PaginatedResult<Payload<T>>;
      },
        { tx, setCache },
      );
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
      id: string | Record<string, string>;
      data: TUpdateInput;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>>;
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
        const result = await timedQuery('updateById', () =>
          getModel(this.deps.prisma, tx).update({
            where: idWhere(primaryKey, id),
            data,
            select: dbSelect,
          }),
        );
        if (!tx && canInvalidate(this.deps.cache)) {
          const resolvedTags =
            typeof tags === 'function'
              ? tags(toPayload<T>(result) as Payload<T>)
              : tags;
          await runInvalidation(
            this.deps.cache,
            invalidate,
            idCacheKey(primaryKey, id),
            resolvedTags ?? undefined,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      },
        { tx, setCache: false },
      );
    }

    async updateMany({
      tx,
      where,
      data,
      // Default 'all' clears entity + query caches — bulk writes otherwise leave
      // stale getById entries until TTL.
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      where: TWhereInput;
      data: TUpdateInput;
      invalidate?: InvalidateMode;
      tags?: MutationTags<unknown>;
    }): Promise<{ count: number }> {
      const delegate = getModel(this.deps.prisma, tx);
      if (!delegate.updateMany) {
        throw new Error(
          `[createRepository] model "${modelName}" does not support updateMany`,
        );
      }
      const result = await timedQuery('updateMany', () =>
        delegate.updateMany!({ where, data }),
      );
      if (!tx && canInvalidate(this.deps.cache)) {
        const resolvedTags = typeof tags === 'function' ? tags(result) : tags;
        await runInvalidation(
          this.deps.cache,
          invalidate,
          undefined,
          resolvedTags ?? undefined,
        );
      }
      return result;
    }

    async upsert<T extends TSelect>({
      tx,
      where,
      create,
      update,
      select,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      where: TWhereInput;
      create: TCreateInput;
      update: TUpdateInput;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>>;
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
        const delegate = getModel(this.deps.prisma, tx);
        if (!delegate.upsert) {
          throw new Error(
            `[createRepository] model "${modelName}" does not support upsert`,
          );
        }
        const result = await timedQuery('upsert', () =>
          delegate.upsert!({
            where,
            create,
            update,
            select: dbSelect,
          }),
        );
        if (!tx && canInvalidate(this.deps.cache)) {
          const resolvedTags =
            typeof tags === 'function'
              ? tags(toPayload<T>(result) as Payload<T>)
              : tags;
          const entityId = extractEntityIdFromRow(result, primaryKey);
          await runInvalidation(
            this.deps.cache,
            invalidate,
            entityId,
            resolvedTags ?? undefined,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      },
        { tx, setCache: false },
      );
    }

    async deleteById<T extends TSelect>({
      tx,
      id,
      select,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      id: string | Record<string, string>;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>>;
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
        const result = await timedQuery('deleteById', () =>
          getModel(this.deps.prisma, tx).delete({
            where: idWhere(primaryKey, id),
            select: dbSelect,
          }),
        );
        if (!tx && canInvalidate(this.deps.cache)) {
          const resolvedTags =
            typeof tags === 'function'
              ? tags(toPayload<T>(result) as Payload<T>)
              : tags;
          await runInvalidation(
            this.deps.cache,
            invalidate,
            idCacheKey(primaryKey, id),
            resolvedTags ?? undefined,
          );
        }
        return toPayload<T>(result) as Payload<T>;
      },
        { tx, setCache: false },
      );
    }

    async deleteMany({
      tx,
      where,
      // Default 'all' — same rationale as updateMany
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      where: TWhereInput;
      invalidate?: InvalidateMode;
      tags?: MutationTags<unknown>;
    }): Promise<{ count: number }> {
      const delegate = getModel(this.deps.prisma, tx);
      if (!delegate.deleteMany) {
        throw new Error(
          `[createRepository] model "${modelName}" does not support deleteMany`,
        );
      }
      const result = await timedQuery('deleteMany', () =>
        delegate.deleteMany!({ where }),
      );
      if (!tx && canInvalidate(this.deps.cache)) {
        const resolvedTags = typeof tags === 'function' ? tags(result) : tags;
        await runInvalidation(
          this.deps.cache,
          invalidate,
          undefined,
          resolvedTags ?? undefined,
        );
      }
      return result;
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

/** Migration alias for {@link createRepository}. */
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
