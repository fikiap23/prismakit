import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  createPgRedisKit,
  requirePgRedisUrls,
  seedIntegrationDb,
  type PgRedisKit,
} from './pg-redis-kit';
import { setTelemetry, clearPrismaMeta } from '../../index';

const { databaseUrl, redisUrl } = requirePgRedisUrls();

describe.skipIf(!databaseUrl || !redisUrl)(
  'PG+Redis edge cases (integration)',
  () => {
    let kit: PgRedisKit;
    const events: Array<{ type: string; method?: string }> = [];

    beforeAll(async () => {
      kit = await createPgRedisKit({
        databaseUrl: databaseUrl!,
        redisUrl: redisUrl!,
        prefix: `pk-edge-${Date.now()}`,
        cache: {
          ttl: 60,
          nullTtl: 2,
          defaultSetCache: false,
          sensitiveFields: ['password'],
          stampede: { enabled: true, lockTtl: 5, maxRetries: 20, retryDelayMs: 20 },
        },
      });
      setTelemetry({
        enabled: true,
        onEvent: (e) => {
          events.push({
            type: e.type,
            method: 'method' in e ? e.method : undefined,
          });
        },
      });
    });

    beforeEach(async () => {
      events.length = 0;
      await seedIntegrationDb(kit.prisma);
      await kit.repos.user.invalidateCache({});
      await kit.repos.wallet.invalidateCache({});
      await kit.repos.tag.invalidateCache({});
    });

    afterAll(async () => {
      setTelemetry({ enabled: false });
      await kit?.disconnect();
    });

    it('nullTtl caches null then expires so create becomes visible', async () => {
      const select = { uid: true, name: true };
      const missing = await kit.repos.user.getById({
        id: 'ghost',
        select,
        setCache: true,
      });
      expect(missing).toBeNull();

      await kit.prisma.user.create({
        data: { uid: 'ghost', name: 'Ghost' },
      });

      // Still null while null sentinel lives
      const stillNull = await kit.repos.user.getById({
        id: 'ghost',
        select,
        setCache: true,
      });
      expect(stillNull).toBeNull();
      expect(events.some((e) => e.type === 'cache.hit')).toBe(true);

      await new Promise((r) => setTimeout(r, 2100));

      const afterTtl = await kit.repos.user.getById({
        id: 'ghost',
        select,
        setCache: true,
      });
      expect(afterTtl?.name).toBe('Ghost');
    }, 10000);

    it('sensitiveFields password select never caches', async () => {
      events.length = 0;
      const row = await kit.repos.user.getById({
        id: 'u1',
        select: { uid: true, password: true },
        setCache: true,
      });
      expect(row?.password).toBe('secret');

      await kit.prisma.user.update({
        where: { uid: 'u1' },
        data: { password: 'rotated' },
      });

      const again = await kit.repos.user.getById({
        id: 'u1',
        select: { uid: true, password: true },
        setCache: true,
      });
      expect(again?.password).toBe('rotated');
      expect(events.filter((e) => e.type === 'cache.hit')).toHaveLength(0);
    });

    it('cacheTags invalidate tagged query lists on mutation', async () => {
      const list = await kit.repos.tag.getMany({
        where: {},
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
        setCache: true,
        cacheTags: ['tags:all'],
      });
      expect(list).toHaveLength(2);

      await kit.repos.tag.create({
        data: { id: 't3', name: 'redis' },
        select: { id: true },
        tags: ['tags:all'],
      });

      const after = await kit.repos.tag.getMany({
        where: {},
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
        setCache: true,
        cacheTags: ['tags:all'],
      });
      expect(after.map((t: { id: string }) => t.id)).toEqual([
        't1',
        't2',
        't3',
      ]);
    });

    it('stampede coalesces parallel getById misses', async () => {
      await kit.repos.user.invalidateCache({ id: 'u1' });
      events.length = 0;

      const select = { uid: true, name: true };
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          kit.repos.user.getById({ id: 'u1', select, setCache: true }),
        ),
      );

      expect(results.every((r) => r?.name === 'Ada')).toBe(true);
      const dbQueries = events.filter(
        (e) => e.type === 'query.complete' && e.method === 'getById',
      );
      expect(dbQueries.length).toBeLessThanOrEqual(2);
    });
  },
);

describe.skipIf(!databaseUrl || !redisUrl)(
  'PG+Redis fail-open (integration)',
  () => {
    it('disconnect Redis mid-read still returns Prisma data', async () => {
      const kit = await createPgRedisKit({
        databaseUrl: databaseUrl!,
        redisUrl: redisUrl!,
        prefix: `pk-failopen-${Date.now()}`,
      });
      try {
        await seedIntegrationDb(kit.prisma);
        await kit.cache.disconnect();
        const row = await kit.repos.user.getById({
          id: 'u1',
          select: { uid: true, name: true },
          setCache: true,
        });
        expect(row).toEqual({ uid: 'u1', name: 'Ada' });
      } finally {
        await kit.prisma.$disconnect();
        clearPrismaMeta();
      }
    });
  },
);
