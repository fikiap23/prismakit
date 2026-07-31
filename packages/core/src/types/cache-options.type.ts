export type CacheMethod =
  | 'getById'
  | 'getThrowById'
  | 'getFirst'
  | 'getMany'
  | 'getManyPaginate';

export interface CacheOptions {
  ttl?: number;
  nullTtl?: number;
  sensitiveFields?: string[];
  methods?: Partial<Record<CacheMethod, { enabled?: boolean; ttl?: number }>>;
}

/** Alias of CacheOptions (legacy name from myrpc-be). */
export type RepositoryCacheOptions = CacheOptions;

export type InvalidateMode = 'all' | 'entity' | 'queries' | 'none';