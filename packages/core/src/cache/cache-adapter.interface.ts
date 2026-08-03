/**
 * Pluggable cache backend for repository cache-aside and invalidation.
 * Implementations should throw from low-level ops; safe* wrappers must fail-open.
 *
 * **Contract:** {@link CacheAdapter.get} / {@link CacheAdapter.safeGet} MUST return
 * a fresh copy of the stored value (structuredClone, JSON round-trip, etc.).
 * AutoComposer mutates entities in place; returning a live reference will corrupt
 * the cache for subsequent readers.
 */
export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  setNx(key: string, ttlSeconds: number): Promise<boolean>;
  setWithIndex(
    key: string,
    value: unknown,
    ttl: number,
    indexKey: string,
  ): Promise<void>;
  invalidateByIndex(indexKey: string): Promise<void>;
  saddAndExpire(key: string, members: string[], ttl: number): Promise<void>;
  smembers(key: string): Promise<string[]>;
  isReady(): boolean;
  getPrefix(): string;

  // safe wrappers (fail-open)
  safeGet<T>(key: string): Promise<T | null>;
  safeSet(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  safeDel(...keys: string[]): Promise<void>;
  safeSetNx(key: string, ttlSeconds: number): Promise<boolean>;
  safeSetWithIndex(
    key: string,
    value: unknown,
    ttl: number,
    indexKey: string,
  ): Promise<void>;
  safeInvalidateByIndex(indexKey: string): Promise<void>;
  safeSaddAndExpire(
    key: string,
    members: string[],
    ttl: number,
  ): Promise<void>;
  safeSmembers(key: string): Promise<string[]>;
}
