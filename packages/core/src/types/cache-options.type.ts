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
}

export type InvalidateMode = 'all' | 'entity' | 'queries' | 'none';
