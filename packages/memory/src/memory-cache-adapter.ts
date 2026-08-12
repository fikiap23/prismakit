import type { CacheAdapter } from '@prismakit/core';

type Entry = {
  value: unknown;
  expiresAt: number;
};

export type MemoryCacheAdapterOptions = {
  prefix?: string;
  /** Max number of entries (LRU-ish eviction by insertion order). Default 1000. */
  maxSize?: number;
  /** Default TTL in seconds when not specified. Default 300. */
  defaultTtl?: number;
};

/**
 * In-memory {@link CacheAdapter} for tests and local development without Redis.
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private readonly store = new Map<string, Entry>();
  private readonly sets = new Map<string, Set<string>>();
  private readonly prefix: string;
  private readonly maxSize: number;
  private readonly defaultTtl: number;
  private ready = true;

  constructor(options: MemoryCacheAdapterOptions = {}) {
    this.prefix = options.prefix ?? 'prismakit';
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTtl = options.defaultTtl ?? 300;
  }

  isReady(): boolean {
    return this.ready;
  }

  getPrefix(): string {
    return this.prefix;
  }

  /** Test helper — wipe all keys. */
  clear(): void {
    this.store.clear();
    this.sets.clear();
  }

  private now(): number {
    return Date.now();
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt <= this.now();
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxSize) {
      const first = this.store.keys().next().value;
      if (first === undefined) break;
      this.store.delete(first);
      // Drop dangling index members pointing at the evicted key
      for (const [idxKey, set] of this.sets) {
        if (set.delete(first) && set.size === 0) {
          this.sets.delete(idxKey);
        }
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return structuredClone(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const ttl = ttlSeconds > 0 ? ttlSeconds : this.defaultTtl;
    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: this.now() + ttl * 1000,
    });
    this.evictIfNeeded();
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
      this.sets.delete(key);
    }
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const existing = this.store.get(key);
    if (existing && !this.isExpired(existing)) return false;
    await this.set(key, '1', ttlSeconds);
    return true;
  }

  async setWithIndex(
    key: string,
    value: unknown,
    ttl: number,
    indexKey: string,
  ): Promise<void> {
    await this.set(key, value, ttl);
    await this.saddAndExpire(indexKey, [key], ttl);
  }

  async invalidateByIndex(indexKey: string): Promise<void> {
    const members = await this.smembers(indexKey);
    await this.del(...members, indexKey);
  }

  async saddAndExpire(
    key: string,
    members: string[],
    ttl: number,
  ): Promise<void> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    for (const m of members) set.add(m);
    // Store a sentinel so TTL cleanup can eventually drop the set index
    await this.set(`__setmeta:${key}`, true, ttl + 60);
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    if (!set) return [];
    return [...set];
  }

  async safeGet<T>(key: string): Promise<T | null> {
    try {
      return await this.get<T>(key);
    } catch {
      return null;
    }
  }

  async safeSet(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.set(key, value, ttlSeconds);
    } catch {
      /* fail-open */
    }
  }

  async safeDel(...keys: string[]): Promise<void> {
    try {
      await this.del(...keys);
    } catch {
      /* fail-open */
    }
  }

  async safeSetNx(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return await this.setNx(key, ttlSeconds);
    } catch {
      return false;
    }
  }

  async safeSetWithIndex(
    key: string,
    value: unknown,
    ttl: number,
    indexKey: string,
  ): Promise<void> {
    try {
      await this.setWithIndex(key, value, ttl, indexKey);
    } catch {
      /* fail-open */
    }
  }

  async safeInvalidateByIndex(indexKey: string): Promise<void> {
    try {
      await this.invalidateByIndex(indexKey);
    } catch {
      /* fail-open */
    }
  }

  async safeSaddAndExpire(
    key: string,
    members: string[],
    ttl: number,
  ): Promise<void> {
    try {
      await this.saddAndExpire(key, members, ttl);
    } catch {
      /* fail-open */
    }
  }

  async safeSmembers(key: string): Promise<string[]> {
    try {
      return await this.smembers(key);
    } catch {
      return [];
    }
  }
}
