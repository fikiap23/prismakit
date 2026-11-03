import type { StampedeOptions } from './stampede-options.type';

export type CacheMethod =
  | 'getById'
  | 'getThrowById'
  | 'getFirst'
  | 'getThrowFirst'
  | 'getMany'
  | 'getManyPaginate'
  | 'getManyCursor'
  | 'count'
  | 'exists'
  | 'aggregate'
  | 'groupBy';

export interface CacheOptions {
  ttl?: number;
  nullTtl?: number;
  sensitiveFields?: string[];
  methods?: Partial<Record<CacheMethod, { enabled?: boolean; ttl?: number }>>;
  /**
   * When true, reads cache by default (`setCache` defaults to true).
   * Pass `setCache: false` to opt out (auth / uniqueness checks).
   */
  defaultSetCache?: boolean;
  /** Stampede protection overrides for this repository. */
  stampede?: StampedeOptions;
  /**
   * When true, cache invalidation failures rethrow instead of fail-open.
   * Prefer for write-heavy paths where stale reads are unacceptable.
   */
  strictInvalidation?: boolean;
  /**
   * Seconds to block cache SET after invalidate (stale in-flight GET race).
   * Default `5`. Set `false` or `0` to disable.
   */
  writeGateTtlSeconds?: number | false;
  /**
   * Multi-tenant friendly invalidation. Default `false` (legacy behavior).
   *
   * When `true`, a mutation / `invalidateCache` that carries `tags` clears only:
   * - query caches registered under those tags, and
   * - query caches registered **without** tags (their scope is unknown),
   *
   * instead of every query cache of the model. Query caches tagged with other
   * tags (e.g. another tenant's `cafe:<id>`) survive. The write gate is also
   * scoped: per tag, per untagged-query bucket and per entity id, rather than
   * per model. Mutations without tags keep clearing all model queries.
   */
  tagScopedInvalidation?: boolean;
}

export type InvalidateMode = 'all' | 'entity' | 'queries' | 'none';
