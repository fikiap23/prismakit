import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCacheAdapter } from '../memory-cache-adapter';

describe('MemoryCacheAdapter', () => {
  let cache: MemoryCacheAdapter;

  beforeEach(() => {
    cache = new MemoryCacheAdapter({ maxSize: 10, prefix: 'test' });
  });

  it('set/get/del', async () => {
    await cache.set('a', { x: 1 }, 60);
    expect(await cache.get('a')).toEqual({ x: 1 });
    await cache.del('a');
    expect(await cache.get('a')).toBeNull();
  });

  it('setNx', async () => {
    expect(await cache.setNx('lock', 10)).toBe(true);
    expect(await cache.setNx('lock', 10)).toBe(false);
  });

  it('setWithIndex + invalidateByIndex', async () => {
    await cache.setWithIndex('k1', { v: 1 }, 60, 'idx');
    await cache.setWithIndex('k2', { v: 2 }, 60, 'idx');
    expect(await cache.get('k1')).toEqual({ v: 1 });
    await cache.invalidateByIndex('idx');
    expect(await cache.get('k1')).toBeNull();
    expect(await cache.get('k2')).toBeNull();
  });

  it('isReady and prefix', () => {
    expect(cache.isReady()).toBe(true);
    expect(cache.getPrefix()).toBe('test');
  });
});
