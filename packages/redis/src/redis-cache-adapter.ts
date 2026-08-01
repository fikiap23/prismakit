import Redis from 'ioredis';
import { gzipSync, gunzipSync } from 'zlib';
import type { CacheAdapter } from '@prismakit/core';
import { redisJsonParse, redisJsonStringify } from './redis-json';

const INDEX_TTL_BUFFER = 60;

/** Lua: atomically SMEMBERS index + DEL members + index. */
const INVALIDATE_BY_INDEX_LUA = `
local members = redis.call('SMEMBERS', KEYS[1])
for i, member in ipairs(members) do
  redis.call('DEL', member)
end
redis.call('DEL', KEYS[1])
return #members
`;

export type RedisCompression = 'none' | 'gzip';

export type RedisCacheAdapterOptions = {
  url?: string;
  host?: string;
  port?: number;
  prefix?: string;
  /**
   * Compress payloads larger than `compressionThresholdBytes` (default 1024).
   * Uses gzip (widely available; zstd/lz4 can be added later).
   */
  compression?: RedisCompression;
  /** Minimum payload size (bytes) before compression (default 1024). */
  compressionThresholdBytes?: number;
};

const COMPRESSED_PREFIX = 'gz:';

/**
 * Redis-backed {@link CacheAdapter}. Framework-agnostic — no NestJS / ConfigService.
 */
export class RedisCacheAdapter implements CacheAdapter {
  private readonly client: Redis;
  private readonly prefix: string;
  private ready = false;
  private readonly compression: RedisCompression;
  private readonly compressionThreshold: number;

  constructor(options: RedisCacheAdapterOptions = {}) {
    const {
      url,
      host = 'localhost',
      port = 6379,
      prefix = 'prismakit',
      compression = 'none',
      compressionThresholdBytes = 1024,
    } = options;

    this.prefix = prefix;
    this.compression = compression;
    this.compressionThreshold = compressionThresholdBytes;
    this.client = url
      ? new Redis(url, { lazyConnect: true })
      : new Redis({ host, port, lazyConnect: true });

    this.client.on('ready', () => {
      this.ready = true;
    });
    this.client.on('error', (err) => {
      this.ready = false;
      console.warn('[RedisCacheAdapter] connection error', err.message);
    });
    this.client.on('close', () => {
      this.ready = false;
    });

    void this.connect();
  }

  async connect(): Promise<void> {
    if (this.client.status === 'ready' || this.client.status === 'connecting') {
      return;
    }
    try {
      await this.client.connect();
    } catch (err) {
      console.warn(
        '[RedisCacheAdapter] failed to connect',
        (err as Error).message,
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.client?.quit();
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  getPrefix(): string {
    return this.prefix;
  }

  private encode(value: unknown): string {
    const json = redisJsonStringify(value);
    if (
      this.compression === 'gzip' &&
      Buffer.byteLength(json, 'utf8') >= this.compressionThreshold
    ) {
      const compressed = gzipSync(Buffer.from(json, 'utf8')).toString('base64');
      return COMPRESSED_PREFIX + compressed;
    }
    return json;
  }

  private decode<T>(raw: string): T {
    if (raw.startsWith(COMPRESSED_PREFIX)) {
      const buf = Buffer.from(raw.slice(COMPRESSED_PREFIX.length), 'base64');
      const json = gunzipSync(buf).toString('utf8');
      return redisJsonParse<T>(json);
    }
    return redisJsonParse<T>(raw);
  }

  // --- low-level ops (may throw) ---

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return this.decode<T>(raw);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, this.encode(value), 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.del(...keys);
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    if (members.length === 0) return;
    await this.client.sadd(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Atomically SET a cache key + SADD into an index SET + EXPIRE the index
   * via a single Redis pipeline.
   */
  async setWithIndex(
    key: string,
    value: unknown,
    ttlSeconds: number,
    indexKey: string,
  ): Promise<void> {
    const pipeline = this.client.pipeline();
    pipeline.set(key, this.encode(value), 'EX', ttlSeconds);
    pipeline.sadd(indexKey, key);
    pipeline.expire(indexKey, ttlSeconds + INDEX_TTL_BUFFER);
    await pipeline.exec();
  }

  /**
   * Atomic invalidation via Lua (SMEMBERS + DEL members + DEL index).
   */
  async invalidateByIndex(indexKey: string): Promise<void> {
    await this.client.eval(INVALIDATE_BY_INDEX_LUA, 1, indexKey);
  }

  async saddAndExpire(
    key: string,
    members: string[],
    ttlSeconds: number,
  ): Promise<void> {
    if (members.length === 0) return;
    const pipeline = this.client.pipeline();
    pipeline.sadd(key, ...members);
    pipeline.expire(key, ttlSeconds + INDEX_TTL_BUFFER);
    await pipeline.exec();
  }

  // --- safe wrappers (never throw — warn + return fallback) ---

  async safeGet<T>(key: string): Promise<T | null> {
    try {
      return await this.get<T>(key);
    } catch (err) {
      console.warn(
        `[RedisCacheAdapter] safeGet failed for key=${key}`,
        (err as Error).message,
      );
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
    } catch (err) {
      console.warn(
        `[RedisCacheAdapter] safeSet failed for key=${key}`,
        (err as Error).message,
      );
    }
  }

  async safeDel(...keys: string[]): Promise<void> {
    try {
      await this.del(...keys);
    } catch (err) {
      console.warn(
        '[RedisCacheAdapter] safeDel failed',
        (err as Error).message,
      );
    }
  }

  async safeSetNx(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return await this.setNx(key, ttlSeconds);
    } catch (err) {
      console.warn(
        `[RedisCacheAdapter] safeSetNx failed for key=${key}`,
        (err as Error).message,
      );
      return false;
    }
  }

  async safeSetWithIndex(
    key: string,
    value: unknown,
    ttlSeconds: number,
    indexKey: string,
  ): Promise<void> {
    try {
      await this.setWithIndex(key, value, ttlSeconds, indexKey);
    } catch (err) {
      console.warn(
        `[RedisCacheAdapter] safeSetWithIndex failed for key=${key}`,
        (err as Error).message,
      );
    }
  }

  async safeInvalidateByIndex(indexKey: string): Promise<void> {
    try {
      await this.invalidateByIndex(indexKey);
    } catch (err) {
      console.warn(
        `[RedisCacheAdapter] safeInvalidateByIndex failed for idx=${indexKey}`,
        (err as Error).message,
      );
    }
  }

  async safeSaddAndExpire(
    key: string,
    members: string[],
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.saddAndExpire(key, members, ttlSeconds);
    } catch (err) {
      console.warn(
        `[RedisCacheAdapter] safeSaddAndExpire failed for key=${key}`,
        (err as Error).message,
      );
    }
  }

  async safeSmembers(key: string): Promise<string[]> {
    try {
      return await this.smembers(key);
    } catch (err) {
      console.warn(
        `[RedisCacheAdapter] safeSmembers failed for key=${key}`,
        (err as Error).message,
      );
      return [];
    }
  }
}
