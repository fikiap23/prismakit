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
});
