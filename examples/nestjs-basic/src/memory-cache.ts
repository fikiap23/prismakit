import type { CacheAdapter } from '@prismakit/core';

/**
 * In-memory CacheAdapter for the example — no Redis required.
 * Production apps should use `@prismakit/redis` (`RedisCacheAdapter`).
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();
  private readonly sets = new Map<string, Set<string>>();

  constructor(private readonly prefix = 'example') {}

  isReady(): boolean {
    return true;
  }

  getPrefix(): string {
    return this.prefix;
  }

  private alive(key: string): string | null {
    const row = this.store.get(key);
    if (!row) return null;
    if (Date.now() > row.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return row.value;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.alive(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
      this.sets.delete(key);
    }
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.alive(key) !== null) return false;
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
    const set = this.sets.get(indexKey) ?? new Set<string>();
    set.add(key);
    this.sets.set(indexKey, set);
  }

  async invalidateByIndex(indexKey: string): Promise<void> {
    const keys = [...(this.sets.get(indexKey) ?? [])];
    await this.del(...keys, indexKey);
  }

  async saddAndExpire(
    key: string,
    members: string[],
    _ttl: number,
  ): Promise<void> {
    const set = this.sets.get(key) ?? new Set<string>();
    for (const m of members) set.add(m);
    this.sets.set(key, set);
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  async safeGet<T>(key: string): Promise<T | null> {
    try {
      return await this.get<T>(key);
    } catch {
      return null;
    }
  }

  async safeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
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
