import type { CacheAdapter } from '../../cache/cache-adapter.interface';

type Entry = { value: unknown; expiresAt: number };

/** Minimal MemoryCacheAdapter clone for core package tests (no cross-pkg dep). */
export class TestMemoryCache implements CacheAdapter {
  private readonly store = new Map<string, Entry>();
  private readonly sets = new Map<string, Set<string>>();
  private readonly prefix: string;
  private ready = true;

  constructor(prefix = 'test') {
    this.prefix = prefix;
  }

  isReady(): boolean {
    return this.ready;
  }

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  getPrefix(): string {
    return this.prefix;
  }

  clear(): void {
    this.store.clear();
    this.sets.clear();
  }

  /** Expose raw store for assertions (no clone). */
  peek(key: string): unknown {
    const e = this.store.get(key);
    if (!e || e.expiresAt <= Date.now()) return null;
    return e.value;
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  private now(): number {
    return Date.now();
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return null;
    }
    return structuredClone(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: this.now() + Math.max(1, ttlSeconds) * 1000,
    });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
      this.sets.delete(key);
    }
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const existing = this.store.get(key);
    if (existing && existing.expiresAt > this.now()) return false;
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
    await this.set(`__setmeta:${key}`, true, ttl + 60);
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
