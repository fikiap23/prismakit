import { afterAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { RedisCacheAdapter } from '../redis-cache-adapter';

function requireRedisUrl(): string | undefined {
  const value = process.env.REDIS_URL;
  if (value) return value;
  if (process.env.FORCE_INTEGRATION === '1' || process.env.CI === 'true') {
    throw new Error(
      '[PrismaKit] REDIS_URL is required for integration tests when CI=true or FORCE_INTEGRATION=1',
    );
  }
  return undefined;
}

const redisUrl = requireRedisUrl();

describe.skipIf(!redisUrl)('RedisCacheAdapter (integration)', () => {
  const prefix = `pk-it-${Date.now()}`;
  const adapter = new RedisCacheAdapter({
    url: redisUrl,
    prefix,
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  it('round-trips Date and BigInt via set/get', async () => {
    const key = `${prefix}:roundtrip`;
    const createdAt = new Date('2026-01-15T12:00:00.000Z');
    const payload = { id: '1', qty: 9007199254740993n, createdAt };

    await adapter.set(key, payload, 60);
    await expect(adapter.get<typeof payload>(key)).resolves.toEqual(payload);
  });

  it('setWithIndex and invalidateByIndex clear indexed keys', async () => {
    const indexKey = `${prefix}:idx:users`;
    const entityKey = `${prefix}:entity:1`;
    await adapter.setWithIndex(entityKey, { id: '1' }, 60, indexKey);
    await expect(adapter.get(entityKey)).resolves.toEqual({ id: '1' });

    await adapter.invalidateByIndex(indexKey);
    await expect(adapter.get(entityKey)).resolves.toBeNull();
  });

  it('never shrinks an index TTL when a shorter-TTL entry joins', async () => {
    const raw = new Redis(redisUrl!);
    try {
      const indexKey = `${prefix}:idx:ttl`;
      await adapter.setWithIndex(`${prefix}:long`, { v: 1 }, 3600, indexKey);
      await adapter.setWithIndex(`${prefix}:short`, null, 60, indexKey);
      await adapter.saddAndExpire(indexKey, [`${prefix}:other`], 10);

      // 3600 + 60s buffer; a plain EXPIRE would have dropped it to 70
      expect(await raw.ttl(indexKey)).toBeGreaterThan(3600);

      await adapter.invalidateByIndex(indexKey);
      await expect(adapter.get(`${prefix}:long`)).resolves.toBeNull();
    } finally {
      await raw.quit();
    }
  });

  it('invalidateByIndex clears indexes larger than one UNLINK batch', async () => {
    const indexKey = `${prefix}:idx:big`;
    const keys = Array.from({ length: 1203 }, (_, i) => `${prefix}:big:${i}`);
    await Promise.all(
      keys.map((key) => adapter.setWithIndex(key, { key }, 60, indexKey)),
    );

    await adapter.invalidateByIndex(indexKey);

    const left = await Promise.all(keys.map((key) => adapter.get(key)));
    expect(left.every((value) => value === null)).toBe(true);
    await expect(adapter.smembers(indexKey)).resolves.toEqual([]);
  });
});
