import { afterAll, describe, expect, it } from 'vitest';
import { RedisCacheAdapter } from '../redis-cache-adapter';

const hasRedis = Boolean(process.env.REDIS_URL);

describe.skipIf(!hasRedis)('RedisCacheAdapter (integration)', () => {
  const prefix = `pk-it-${Date.now()}`;
  const adapter = new RedisCacheAdapter({
    url: process.env.REDIS_URL,
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
});
