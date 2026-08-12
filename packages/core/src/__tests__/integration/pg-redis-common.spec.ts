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
import { setTelemetry } from '../../index';

const { databaseUrl, redisUrl } = requirePgRedisUrls();

describe.skipIf(!databaseUrl || !redisUrl)(
  'PG+Redis common CRUD/cache (integration)',
  () => {
    let kit: PgRedisKit;
    const events: string[] = [];

    beforeAll(async () => {
      kit = await createPgRedisKit({
        databaseUrl: databaseUrl!,
        redisUrl: redisUrl!,
        prefix: `pk-common-${Date.now()}`,
        cache: {
          ttl: 120,
          nullTtl: 5,
          defaultSetCache: false,
          sensitiveFields: ['password'],
        },
      });
      setTelemetry({
        enabled: true,
        onEvent: (e) => {
          events.push(e.type);
        },
      });
    });

    beforeEach(async () => {
      events.length = 0;
      await seedIntegrationDb(kit.prisma);
      // Flush this prefix's keys by invalidating broadly via repo helpers
      await kit.repos.user.invalidateCache({});
      await kit.repos.post.invalidateCache({});
      await kit.repos.tag.invalidateCache({});
      await kit.repos.postTag.invalidateCache({});
      await kit.repos.wallet.invalidateCache({});
    });

    afterAll(async () => {
      setTelemetry({ enabled: false });
      await kit?.disconnect();
    });

    it('getById caches on second read (cache.hit)', async () => {
      const select = { uid: true, name: true };
      const first = await kit.repos.user.getById({
        id: 'u1',
        select,
        setCache: true,
      });
      expect(first).toMatchObject({ uid: 'u1', name: 'Ada' });

      events.length = 0;
      const second = await kit.repos.user.getById({
        id: 'u1',
        select,
        setCache: true,
      });
      expect(second).toEqual(first);
      expect(events).toContain('cache.hit');
    });

    it('getFirst / getMany / getManyPaginate / getManyCursor work', async () => {
      const first = await kit.repos.user.getFirst({
        where: { name: 'Ada' },
        select: { uid: true, name: true },
      });
      expect(first?.uid).toBe('u1');

      const many = await kit.repos.post.getMany({
        where: { writerRef: 'u1' },
        select: { postId: true, title: true },
        orderBy: { postId: 'asc' },
        setCache: true,
      });
      expect(many.map((p: { postId: string }) => p.postId)).toEqual([
        'p1',
        'p2',
      ]);

      const page = await kit.repos.post.getManyPaginate({
        where: {},
        select: { postId: true },
        orderBy: { postId: 'asc' },
        page: 1,
        pageSize: 1,
        setCache: true,
      });
      expect(page.data).toHaveLength(1);
      expect(page.meta.totalItems).toBe(2);
      expect(page.meta.totalPages).toBe(2);

      const cursor = await kit.repos.post.getManyCursor({
        where: {},
        select: { postId: true, title: true },
        orderBy: { postId: 'asc' },
        take: 1,
        setCache: true,
      });
      expect(cursor.data).toHaveLength(1);
      expect(cursor.hasMore).toBe(true);
      expect(cursor.nextCursor).toBeTruthy();

      const page2 = await kit.repos.post.getManyCursor({
        where: {},
        select: { postId: true, title: true },
        orderBy: { postId: 'asc' },
        cursor: { postId: cursor.nextCursor },
        take: 1,
      });
      expect(page2.data[0].postId).toBe('p2');
      expect(page2.hasMore).toBe(false);
    });

    it('create / updateById / upsert / deleteById invalidate entity cache', async () => {
      const select = { uid: true, name: true };
      await kit.repos.user.getById({ id: 'u1', select, setCache: true });

      await kit.repos.user.updateById({
        id: 'u1',
        data: { name: 'Ada Lovelace' },
        select: { uid: true },
      });

      const afterUpdate = await kit.repos.user.getById({
        id: 'u1',
        select,
        setCache: true,
      });
      expect(afterUpdate?.name).toBe('Ada Lovelace');

      await kit.repos.user.upsert({
        where: { uid: 'u3' },
        create: { uid: 'u3', name: 'Cara' },
        update: { name: 'Cara' },
        select: { uid: true, name: true },
      });
      const u3 = await kit.repos.user.getById({
        id: 'u3',
        select,
        setCache: true,
      });
      expect(u3?.name).toBe('Cara');

      await kit.repos.user.deleteById({ id: 'u3', select: { uid: true } });
      const gone = await kit.repos.user.getById({
        id: 'u3',
        select,
        setCache: false,
      });
      expect(gone).toBeNull();
    });

    it('updateMany / deleteMany clear list caches', async () => {
      await kit.repos.tag.getMany({
        where: {},
        select: { id: true, name: true },
        setCache: true,
      });

      await kit.repos.tag.updateMany({
        where: { id: 't2' },
        data: { name: 'nodejs' },
      });

      const tags = await kit.repos.tag.getMany({
        where: {},
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
        setCache: true,
      });
      expect(tags.find((t: { id: string }) => t.id === 't2')?.name).toBe(
        'nodejs',
      );

      await kit.repos.postTag.deleteMany({
        where: { tagId: 't2' },
      });
      await kit.repos.tag.deleteMany({ where: { id: 't2' } });
      const after = await kit.repos.tag.getMany({
        where: {},
        select: { id: true },
        setCache: false,
      });
      expect(after.map((t: { id: string }) => t.id)).toEqual(['t1']);
    });

    it('createMany skipDuplicates is idempotent', async () => {
      const first = await kit.repos.tag.createMany({
        data: [
          { id: 't1', name: 'ts' },
          { id: 't9', name: 'edge' },
        ],
        skipDuplicates: true,
      });
      expect(first.count).toBe(1);

      const second = await kit.repos.tag.createMany({
        data: [{ id: 't9', name: 'edge' }],
        skipDuplicates: true,
      });
      expect(second.count).toBe(0);

      const tags = await kit.repos.tag.getMany({
        where: { id: 't9' },
        select: { id: true, name: true },
      });
      expect(tags).toHaveLength(1);
    });

    it('composite PK PostTag get/create/delete', async () => {
      const row = await kit.repos.postTag.getById({
        id: { postId: 'p1', tagId: 't1' },
        select: { postId: true, tagId: true },
        setCache: true,
      });
      expect(row).toEqual({ postId: 'p1', tagId: 't1' });

      await kit.repos.postTag.create({
        data: { postId: 'p2', tagId: 't2' },
        select: { postId: true, tagId: true },
      });

      const created = await kit.repos.postTag.getById({
        id: { postId: 'p2', tagId: 't2' },
        select: { postId: true, tagId: true },
      });
      expect(created).toEqual({ postId: 'p2', tagId: 't2' });

      await kit.repos.postTag.deleteById({
        id: { postId: 'p2', tagId: 't2' },
        select: { postId: true, tagId: true },
      });
      const gone = await kit.repos.postTag.getById({
        id: { postId: 'p2', tagId: 't2' },
        select: { postId: true, tagId: true },
      });
      expect(gone).toBeNull();
    });
  },
);
