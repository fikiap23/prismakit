import type { CacheAdapter } from './cache/cache-adapter.interface';
import { validateCacheConfig } from './cache/validate-cache-config';
import {
  buildEntityKey,
  buildQueryKey,
  entityIndexKey,
  entityAllIndexKey,
  queryIndexKey,
  tagIndexKey,
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
import { ensurePrismaMeta, getModelMeta, getPrismaMeta } from './schema/prisma-meta';
import { emitTelemetry } from './telemetry/telemetry';
import type { ComposeOptions } from './compose/compose-options';
import { wrapPrismaError, RecordNotFoundError } from './errors';
import type { CursorPage } from './types/paginated-result.type';

const paginate: PaginateFunction = paginator({});

const NULL_SENTINEL = { __prismakit_null: true as const };
function isNullSentinel(v: unknown): boolean {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as { __prismakit_null?: boolean }).__prismakit_null === true
  );
}
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
 * Uses tagged JSON for Date/BigInt/Buffer preservation.
 */
function cloneForCompose<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through */
    }
  }
  const replacer = (_k: string, v: unknown) => {
    if (typeof v === 'bigint') return { __bigint: v.toString() };
    if (v instanceof Date) return { __date: v.toISOString() };
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v))
      return { __bytes: v.toString('base64') };
    return v;
  };
  const reviver = (_k: string, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length === 1 && '__bigint' in o && typeof o.__bigint === 'string')
        return BigInt(o.__bigint);
      if (keys.length === 1 && '__date' in o && typeof o.__date === 'string')
        return new Date(o.__date);
      if (keys.length === 1 && '__bytes' in o && typeof o.__bytes === 'string')
        return Buffer.from(o.__bytes as string, 'base64');
    }
    return v;
  };
  return JSON.parse(JSON.stringify(value, replacer), reviver) as T;
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

  if (options.model && !options.scalarFields && !getModelMeta(options.model) && getPrismaMeta()) {
    throw new Error(
      `[createRepository] model "${options.model}" has no Prisma meta. Ensure prisma/schema.prisma exists (or set schemaPath), or pass scalarFields explicitly.`,
    );
  }

  if (options.model && options.scalarFields) {
    const metaSf = getModelMeta(options.model)?.scalarFields;
    if (metaSf) {
      const overlap = Object.keys(options.scalarFields).some((k) => k in metaSf);
      if (!overlap) {
        throw new Error(
          `[createRepository] scalarFields do not match model "${options.model}" meta — wrong Prisma.*ScalarFieldEnum?`,
        );
      }
    }
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
    read: () => Promise<T | null | unknown>,
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
        if (isNullSentinel(raw)) return { hit: true as const, data: null };
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
          if (isNullSentinel(waited.data)) {
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
      const raw = await cache.safeGet<unknown>(key);
      if (raw !== null) {
        if (isNullSentinel(raw)) return { hit: true as const, data: null };
        return { hit: true as const, data: raw as TResult };
      }
      const locked = await acquireLock(cache, key);
      if (!locked) {
        emitTelemetry({ type: 'stampede.locked', model: modelName, key });
        const waited = await waitForStampede(cache, key, () =>
          cache.safeGet<unknown>(key),
        );
        if (waited.hit) {
          if (isNullSentinel(waited.data)) {
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
        const idxKey = tagIndexKey(prefix, modelName, tag);
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
    if (cacheOpts?.strictInvalidation && (cache as any).invalidateByIndex) {
      await (cache as any).invalidateByIndex(idxKey);
    } else {
      await cache.safeInvalidateByIndex(idxKey);
    }
    await cache.safeDel(`__setmeta:${idxKey}`);
    emitTelemetry({
      type: 'cache.invalidate',
      model: modelName,
      detail: `entity:${id}`,
    });
  }

  async function doInvalidateQueries(cache: CacheAdapter): Promise<void> {
    const idxKey = queryIndexKey(getPrefix(cache), modelName);
    if (cacheOpts?.strictInvalidation && (cache as any).invalidateByIndex) {
      await (cache as any).invalidateByIndex(idxKey);
    } else {
      await cache.safeInvalidateByIndex(idxKey);
    }
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
    const invalidateFn = cacheOpts?.strictInvalidation
      ? (idxKey: string) => cache.invalidateByIndex
        ? cache.invalidateByIndex(idxKey)
        : cache.safeInvalidateByIndex(idxKey)
      : (idxKey: string) => cache.safeInvalidateByIndex(idxKey);
    await Promise.all(
      tags.map(async (tag) => {
        const idxKey = tagIndexKey(prefix, modelName, tag);
        await invalidateFn(idxKey);
      }),
    );
    emitTelemetry({
      type: 'cache.invalidate',
      model: modelName,
      detail: `tags:${tags.join(',')}`,
    });
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
      if (deps.cache && !(deps.cache as any).onError) {
        (deps.cache as any).onError = (err: unknown, op: string) => {
          emitTelemetry({ type: 'cache.error', model: modelName, detail: op, error: err });
        };
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
            const entityKey = buildEntityKey({
              prefix: useCache ? getPrefix(this.deps.cache!) : '',
              model: modelName,
              id: idCacheKey(primaryKey, id),
              method: 'getById',
              select: dbSelect,
            });
            const result = await singleflight(`db:entity:${entityKey}`, async () => {
              const row = await timedQuery('getById', () =>
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
                  row,
                  dbSelect,
                );
              }
              return row;
            });
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
            const entityKey = buildEntityKey({
              prefix: useCache ? getPrefix(this.deps.cache!) : '',
              model: modelName,
              id: idCacheKey(primaryKey, id),
              method: 'getThrowById',
              select: dbSelect,
            });
            const result = await singleflight(`db:entity:${entityKey}`, async () => {
              const row = await timedQuery('getThrowById', () =>
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
                  row,
                  dbSelect,
                );
              }
              return row;
            });
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
            wrapPrismaError(err, { model: modelName, where: idWhere(primaryKey, id) });
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

        const queryKey = buildQueryKey({ prefix: useCache ? getPrefix(this.deps.cache!) : '', model: modelName, method: 'getFirst', params });
        const result = await singleflight(`db:query:${queryKey}`, async () => {
          const row = await timedQuery('getFirst', () =>
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
              row,
              resolvedTags,
            );
          }
          return row;
        });
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

        const queryKey = buildQueryKey({ prefix: useCache ? getPrefix(this.deps.cache!) : '', model: modelName, method: 'getMany', params });
        const results = await singleflight(`db:query:${queryKey}`, async () => {
          const rows = await timedQuery('getMany', () =>
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
              rows,
              resolvedTags,
            );
          }
          return rows;
        });
        return results.map((item: unknown) => toPayload<T>(item) as Payload<T>);
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

    async getThrowFirst<T extends TSelect>({
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
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          if (lock) {
            assertLockPrerequisites(tx, lockConfig);
            if (!where || typeof where !== 'object') {
              throw new Error('Row lock on getThrowFirst requires a simple where object');
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
            if (!rows[0]) {
              throw new RecordNotFoundError(
                `Record not found (${modelName})`,
                { model: modelName, where },
              );
            }
            return toPayload<T>(rows[0]) as Payload<T>;
          }

          const params = { where, select: dbSelect } as Record<string, unknown>;
          const useCache =
            shouldCache('getThrowFirst', setCache, tx, dbSelect) &&
            canUseCache(this.deps.cache);

          if (useCache) {
            const cached = await cacheGetQuery<unknown>(
              this.deps.cache!,
              'getThrowFirst',
              params,
            );
            if (cached.hit) {
              recordCacheDebug('getThrowFirst', 'HIT', modelName);
              emitTelemetry({
                type: 'cache.hit',
                model: modelName,
                method: 'getThrowFirst',
              });
              if (cached.data === null) {
                throw new RecordNotFoundError(
                  `Record not found (${modelName})`,
                  { model: modelName, where },
                );
              }
              return toPayload<T>(cached.data) as Payload<T>;
            }
            recordCacheDebug('getThrowFirst', 'MISS', modelName);
            emitTelemetry({
              type: 'cache.miss',
              model: modelName,
              method: 'getThrowFirst',
            });
          }

          try {
            const queryKey = buildQueryKey({ prefix: useCache ? getPrefix(this.deps.cache!) : '', model: modelName, method: 'getThrowFirst', params });
            const result = await singleflight(`db:query:${queryKey}`, async () => {
              const row = await timedQuery('getThrowFirst', () =>
                getModel(this.deps.prisma, tx).findFirst({
                  where,
                  select: dbSelect,
                }),
              );
              if (row === null) {
                throw new RecordNotFoundError(
                  `Record not found (${modelName})`,
                  { model: modelName, where },
                );
              }
              if (useCache) {
                const resolvedTags = resolveTags(where, cacheTags as any);
                await cacheSetQuery(
                  this.deps.cache!,
                  'getThrowFirst',
                  params,
                  row,
                  resolvedTags,
                );
              }
              return row;
            });
            return toPayload<T>(result) as Payload<T>;
          } catch (err) {
            wrapPrismaError(err, { model: modelName, where });
            throw err;
          }
        },
        { tx, setCache },
      );
    }

    async count({
      tx,
      where,
      select,
      setCache,
      cacheTags,
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      select?: object;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
    }): Promise<number> {
      const params = { where, select } as Record<string, unknown>;
      const useCache =
        shouldCache('count', setCache, tx) &&
        canUseCache(this.deps.cache);

      if (useCache) {
        const cached = await cacheGetQuery<number>(
          this.deps.cache!,
          'count',
          params,
        );
        if (cached.hit) {
          recordCacheDebug('count', 'HIT', modelName);
          emitTelemetry({ type: 'cache.hit', model: modelName, method: 'count' });
          return cached.data ?? 0;
        }
        recordCacheDebug('count', 'MISS', modelName);
        emitTelemetry({ type: 'cache.miss', model: modelName, method: 'count' });
      }

      const result = await timedQuery('count', () =>
        getModel(this.deps.prisma, tx).count({ where, select }),
      );
      if (useCache) {
        const resolvedTags = resolveTags(where, cacheTags as any);
        await cacheSetQuery(this.deps.cache!, 'count', params, result, resolvedTags);
      }
      return typeof result === 'number' ? result : Number(result);
    }

    async exists({
      tx,
      where,
      setCache,
      cacheTags,
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
    }): Promise<boolean> {
      const params = { where, take: 1 } as Record<string, unknown>;
      const useCache =
        shouldCache('exists', setCache, tx) &&
        canUseCache(this.deps.cache);

      if (useCache) {
        const cached = await cacheGetQuery<boolean>(
          this.deps.cache!,
          'exists',
          params,
        );
        if (cached.hit) {
          recordCacheDebug('exists', 'HIT', modelName);
          emitTelemetry({ type: 'cache.hit', model: modelName, method: 'exists' });
          return cached.data ?? false;
        }
        recordCacheDebug('exists', 'MISS', modelName);
        emitTelemetry({ type: 'cache.miss', model: modelName, method: 'exists' });
      }

      const n = await timedQuery('exists', () =>
        getModel(this.deps.prisma, tx).count({ where, take: 1 }),
      );
      const result = n > 0;
      if (useCache) {
        const resolvedTags = resolveTags(where, cacheTags as any);
        await cacheSetQuery(this.deps.cache!, 'exists', params, result, resolvedTags);
      }
      return result;
    }

    async aggregate({
      tx,
      where,
      setCache,
      cacheTags,
      ...rest
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
      [key: string]: unknown;
    }): Promise<unknown> {
      const delegate = getModel(this.deps.prisma, tx);
      if (!delegate.aggregate) {
        throw new Error(
          `[createRepository] model "${modelName}" does not support aggregate`,
        );
      }
      const params = { where, ...rest } as Record<string, unknown>;
      const useCache =
        shouldCache('aggregate', setCache, tx) &&
        canUseCache(this.deps.cache);

      if (useCache) {
        const cached = await cacheGetQuery<unknown>(
          this.deps.cache!,
          'aggregate',
          params,
        );
        if (cached.hit) {
          recordCacheDebug('aggregate', 'HIT', modelName);
          emitTelemetry({ type: 'cache.hit', model: modelName, method: 'aggregate' });
          return cached.data;
        }
        recordCacheDebug('aggregate', 'MISS', modelName);
        emitTelemetry({ type: 'cache.miss', model: modelName, method: 'aggregate' });
      }

      const result = await timedQuery('aggregate', () =>
        delegate.aggregate!({ where, ...rest }),
      );
      if (useCache) {
        const resolvedTags = resolveTags(where, cacheTags as any);
        await cacheSetQuery(this.deps.cache!, 'aggregate', params, result, resolvedTags);
      }
      return result;
    }

    async groupBy({
      tx,
      setCache,
      cacheTags,
      ...rest
    }: {
      tx?: PrismaClientLike;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: unknown) => string[]);
      [key: string]: unknown;
    }): Promise<unknown> {
      const delegate = getModel(this.deps.prisma, tx);
      if (!delegate.groupBy) {
        throw new Error(
          `[createRepository] model "${modelName}" does not support groupBy`,
        );
      }
      const params = { ...rest } as Record<string, unknown>;
      const useCache =
        shouldCache('groupBy', setCache, tx) &&
        canUseCache(this.deps.cache);

      if (useCache) {
        const cached = await cacheGetQuery<unknown>(
          this.deps.cache!,
          'groupBy',
          params,
        );
        if (cached.hit) {
          recordCacheDebug('groupBy', 'HIT', modelName);
          emitTelemetry({ type: 'cache.hit', model: modelName, method: 'groupBy' });
          return cached.data;
        }
        recordCacheDebug('groupBy', 'MISS', modelName);
        emitTelemetry({ type: 'cache.miss', model: modelName, method: 'groupBy' });
      }

      const result = await timedQuery('groupBy', () =>
        delegate.groupBy!(rest),
      );
      if (useCache) {
        const resolvedTags = resolveTags((rest as any).where, cacheTags as any);
        await cacheSetQuery(this.deps.cache!, 'groupBy', params, result, resolvedTags);
      }
      return result;
    }

    async getManyCursor<T extends TSelect>({
      tx,
      where,
      select,
      orderBy,
      cursor,
      take = 20,
      skip,
      setCache,
      cacheTags,
    }: {
      tx?: PrismaClientLike;
      where?: TWhereInput;
      select?: T;
      orderBy?: TOrderBy;
      cursor?: unknown;
      take?: number;
      skip?: number;
      setCache?: boolean;
      cacheTags?: string[] | ((where?: TWhereInput) => string[]);
    }): Promise<CursorPage<Payload<T>>> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          const params = { where, select: dbSelect, orderBy, cursor, take, skip } as Record<string, unknown>;
          const useCache =
            shouldCache('getManyCursor', setCache, tx, dbSelect) &&
            canUseCache(this.deps.cache);

          if (useCache) {
            const cached = await cacheGetQuery<CursorPage<unknown>>(
              this.deps.cache!,
              'getManyCursor',
              params,
            );
            if (cached.hit) {
              recordCacheDebug('getManyCursor', 'HIT', modelName);
              emitTelemetry({ type: 'cache.hit', model: modelName, method: 'getManyCursor' });
              const data = (cached.data?.data ?? []).map(
                (item) => toPayload<T>(item) as Payload<T>,
              );
              return { ...(cached.data as CursorPage<Payload<T>>), data };
            }
            recordCacheDebug('getManyCursor', 'MISS', modelName);
            emitTelemetry({ type: 'cache.miss', model: modelName, method: 'getManyCursor' });
          }

          const fetchCount = take + 1;
          const findManyArgs: any = {
            where,
            select: dbSelect,
            orderBy,
            take: fetchCount,
          };
          if (cursor) findManyArgs.cursor = cursor;
          if (skip) findManyArgs.skip = skip;

          const rows = await timedQuery('getManyCursor', () =>
            getModel(this.deps.prisma, tx).findMany(findManyArgs),
          );

          const hasMore = rows.length > take;
          const data = hasMore ? rows.slice(0, take) : rows;
          let nextCursor: unknown | null = null;
          if (hasMore && data.length > 0) {
            const lastRow = data[data.length - 1] as Record<string, unknown>;
            if (Array.isArray(primaryKey)) {
              const cursorObj: Record<string, unknown> = {};
              for (const k of primaryKey) cursorObj[k] = lastRow[k];
              nextCursor = cursorObj;
            } else {
              nextCursor = lastRow[primaryKey] ?? null;
            }
          }

          const mapped = data.map((item: unknown) => toPayload<T>(item) as Payload<T>);
          const result: CursorPage<Payload<T>> = { data: mapped, nextCursor, hasMore };

          if (useCache) {
            const resolvedTags = resolveTags(where, cacheTags as any);
            await cacheSetQuery(this.deps.cache!, 'getManyCursor', params, result, resolvedTags);
          }
          return result;
        },
        { tx, setCache },
      );
    }

    async update<T extends TSelect>({
      tx,
      where,
      data,
      select,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      where: TWhereInput;
      data: TUpdateInput;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>>;
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          const selectForWrite = ensureSelectPrimaryKey(
            dbSelect ?? {},
            primaryKey,
            scalarFields,
          ) as Record<string, any>;
          const result = await timedQuery('update', () =>
            getModel(this.deps.prisma, tx).update({
              where,
              data,
              select: selectForWrite,
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

    async delete<T extends TSelect>({
      tx,
      where,
      select,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      where: TWhereInput;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>>;
    }): Promise<Payload<T>> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          const selectForWrite = ensureSelectPrimaryKey(
            dbSelect ?? {},
            primaryKey,
            scalarFields,
          ) as Record<string, any>;
          const result = await timedQuery('delete', () =>
            getModel(this.deps.prisma, tx).delete({
              where,
              select: selectForWrite,
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

    async createManyAndReturn<T extends TSelect>({
      tx,
      data,
      select,
      skipDuplicates,
      invalidate = 'queries',
      tags,
    }: {
      tx?: PrismaClientLike;
      data: TCreateInput[];
      select?: T;
      skipDuplicates?: boolean;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>[]>;
    }): Promise<Payload<T>[]> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          const delegate = getModel(this.deps.prisma, tx);
          if (!delegate.createManyAndReturn) {
            throw new Error(
              `[createRepository] model "${modelName}" does not support createManyAndReturn`,
            );
          }
          const results = await timedQuery('createManyAndReturn', () =>
            delegate.createManyAndReturn!({ data, select: dbSelect, skipDuplicates }),
          );
          if (!tx && canInvalidate(this.deps.cache)) {
            const mapped = results.map((item: unknown) => toPayload<T>(item) as Payload<T>);
            const resolvedTags =
              typeof tags === 'function' ? tags(mapped) : tags;
            await runInvalidation(
              this.deps.cache,
              invalidate,
              undefined,
              resolvedTags ?? undefined,
            );
          }
          return results.map((item: unknown) => toPayload<T>(item) as Payload<T>);
        },
        { tx, setCache: false },
      );
    }

    async updateManyAndReturn<T extends TSelect>({
      tx,
      where,
      data,
      select,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      where: TWhereInput;
      data: TUpdateInput;
      select?: T;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>[]>;
    }): Promise<Payload<T>[]> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          const delegate = getModel(this.deps.prisma, tx);
          if (!delegate.updateManyAndReturn) {
            throw new Error(
              `[createRepository] model "${modelName}" does not support updateManyAndReturn`,
            );
          }
          const results = await timedQuery('updateManyAndReturn', () =>
            delegate.updateManyAndReturn!({ where, data, select: dbSelect }),
          );
          if (!tx && canInvalidate(this.deps.cache)) {
            const mapped = results.map((item: unknown) => toPayload<T>(item) as Payload<T>);
            const resolvedTags =
              typeof tags === 'function' ? tags(mapped) : tags;
            await runInvalidation(
              this.deps.cache,
              invalidate,
              undefined,
              resolvedTags ?? undefined,
            );
          }
          return results.map((item: unknown) => toPayload<T>(item) as Payload<T>);
        },
        { tx, setCache: false },
      );
    }

    async upsertMany<T extends TSelect>({
      tx,
      items,
      select,
      chunkSize = 50,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      items: Array<{
        where: TWhereInput;
        create: TCreateInput;
        update: TUpdateInput;
      }>;
      select?: T;
      chunkSize?: number;
      invalidate?: InvalidateMode;
      tags?: MutationTags<Payload<T>[]>;
    }): Promise<Payload<T>[]> {
      return this.processSelectAndCompose(
        select,
        async (dbSelect) => {
          const delegate = getModel(this.deps.prisma, tx);
          if (!delegate.upsert) {
            throw new Error(
              `[createRepository] model "${modelName}" does not support upsert`,
            );
          }
          const run = async (client: PrismaClientLike) => {
            const out: unknown[] = [];
            for (let i = 0; i < items.length; i += chunkSize) {
              const chunk = items.slice(i, i + chunkSize);
              const part = await Promise.all(
                chunk.map((it) =>
                  getModel(this.deps.prisma, client).upsert!({
                    where: it.where,
                    create: it.create,
                    update: it.update,
                    select: dbSelect,
                  }),
                ),
              );
              out.push(...part);
            }
            return out;
          };

          let results: unknown[];
          if (tx) {
            results = await timedQuery('upsertMany', () => run(tx));
          } else {
            const client = this.deps.prisma as any;
            if (client.$transaction) {
              results = await timedQuery('upsertMany', () =>
                client.$transaction((txClient: PrismaClientLike) => run(txClient)),
              );
            } else {
              results = await timedQuery('upsertMany', () => run(this.deps.prisma));
            }
          }

          if (!tx && canInvalidate(this.deps.cache)) {
            const mapped = results.map((item) => toPayload<T>(item) as Payload<T>);
            const resolvedTags =
              typeof tags === 'function' ? tags(mapped) : tags;
            await runInvalidation(
              this.deps.cache,
              invalidate,
              undefined,
              resolvedTags ?? undefined,
            );
          }
          return results.map((item) => toPayload<T>(item) as Payload<T>);
        },
        { tx, setCache: false },
      );
    }

    async queryRaw<TResult = unknown>({
      tx,
      sql,
      values,
    }: {
      tx?: PrismaClientLike;
      sql: TemplateStringsArray | string;
      values?: unknown[];
    }): Promise<TResult> {
      const client = (tx ?? this.deps.prisma) as any;
      return timedQuery('queryRaw', () => {
        if (Array.isArray(sql) && 'raw' in Object(sql)) {
          return client.$queryRaw(sql, ...(values ?? []));
        }
        return client.$queryRawUnsafe(String(sql), ...(values ?? []));
      });
    }

    async executeRaw({
      tx,
      sql,
      values,
      invalidate = 'all',
      tags,
    }: {
      tx?: PrismaClientLike;
      sql: TemplateStringsArray | string;
      values?: unknown[];
      invalidate?: InvalidateMode;
      tags?: MutationTags<unknown>;
    }): Promise<number> {
      const client = (tx ?? this.deps.prisma) as any;
      const result = await timedQuery('executeRaw', () => {
        if (Array.isArray(sql) && 'raw' in Object(sql)) {
          return client.$executeRaw(sql, ...(values ?? []));
        }
        return client.$executeRawUnsafe(String(sql), ...(values ?? []));
      });
      if (!tx && canInvalidate(this.deps.cache)) {
        const resolvedTags = typeof tags === 'function' ? tags(result) : tags;
        await runInvalidation(
          this.deps.cache,
          invalidate,
          undefined,
          resolvedTags ?? undefined,
        );
      }
      return typeof result === 'number' ? result : Number(result);
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
