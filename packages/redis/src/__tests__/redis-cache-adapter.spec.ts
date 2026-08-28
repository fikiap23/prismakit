import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = {
  status: 'wait',
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  sadd: vi.fn(),
  smembers: vi.fn(),
  pipeline: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockClient),
}));

describe('RedisCacheAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.status = 'wait';
    mockClient.on.mockImplementation(() => mockClient);
  });

  it('connects with lazyConnect and exposes prefix', async () => {
    const { RedisCacheAdapter } = await import('../redis-cache-adapter');
    const adapter = new RedisCacheAdapter({
      host: '127.0.0.1',
      port: 6379,
      prefix: 'test',
    });

    expect(adapter.getPrefix()).toBe('test');
    expect(mockClient.connect).toHaveBeenCalled();
    await adapter.disconnect();
    expect(mockClient.quit).toHaveBeenCalled();
  });

  it('safeGet returns null on failure', async () => {
    const { RedisCacheAdapter } = await import('../redis-cache-adapter');
    mockClient.get.mockRejectedValue(new Error('down'));
    const adapter = new RedisCacheAdapter({ prefix: 't' });
    await expect(adapter.safeGet('k')).resolves.toBeNull();
  });

  it('round-trips BigInt via redisJson helpers', async () => {
    const { redisJsonParse, redisJsonStringify } = await import('../redis-json');
    const payload = { id: '1', qty: 9007199254740993n, nested: { n: 1n } };
    const raw = redisJsonStringify(payload);
    expect(raw).toContain('__bigint');
    const parsed = redisJsonParse<typeof payload>(raw);
    expect(parsed.qty).toBe(9007199254740993n);
    expect(parsed.nested.n).toBe(1n);
  });

  it('round-trips Date and Buffer via redisJson helpers', async () => {
    const { redisJsonParse, redisJsonStringify } = await import('../redis-json');
    const createdAt = new Date('2026-01-15T12:00:00.000Z');
    const blob = Buffer.from('hello');
    const payload = { createdAt, blob };
    const raw = redisJsonStringify(payload);
    expect(raw).toContain('__date');
    expect(raw).toContain('__bytes');
    const parsed = redisJsonParse<typeof payload>(raw);
    expect(parsed.createdAt).toEqual(createdAt);
    expect(Buffer.isBuffer(parsed.blob)).toBe(true);
    expect(parsed.blob.toString()).toBe('hello');
  });

  it('round-trips Decimal despite Decimal#toJSON', async () => {
    class Decimal {
      constructor(private readonly value: string) {}
      toFixed() {
        return this.value;
      }
      toJSON() {
        return this.value;
      }
    }
    const { redisJsonParse, redisJsonStringify } = await import('../redis-json');
    const raw = redisJsonStringify({ amount: new Decimal('8.20') });
    expect(raw).toContain('__decimal');
    const parsed = redisJsonParse<{ amount: Decimal }>(raw, {
      decimalFactory: (s) => new Decimal(s),
    });
    expect(parsed.amount).toBeInstanceOf(Decimal);
    expect(parsed.amount.toFixed()).toBe('8.20');
  });

  it('set/get uses BigInt-safe JSON', async () => {
    const { RedisCacheAdapter } = await import('../redis-cache-adapter');
    let stored: string | undefined;
    mockClient.set.mockImplementation((_k: string, v: string) => {
      stored = v;
      return Promise.resolve('OK');
    });
    mockClient.get.mockImplementation(() => Promise.resolve(stored ?? null));

    const adapter = new RedisCacheAdapter({ prefix: 't' });
    await adapter.set('k', { amount: 42n }, 60);
    expect(stored).toContain('__bigint');
    await expect(adapter.get<{ amount: bigint }>('k')).resolves.toEqual({
      amount: 42n,
    });
  });
});
