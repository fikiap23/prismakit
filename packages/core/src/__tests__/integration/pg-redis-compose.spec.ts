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

const { databaseUrl, redisUrl } = requirePgRedisUrls();

describe.skipIf(!databaseUrl || !redisUrl)(
  'PG+Redis compose (integration)',
  () => {
    let kit: PgRedisKit;

    beforeAll(async () => {
      kit = await createPgRedisKit({
        databaseUrl: databaseUrl!,
        redisUrl: redisUrl!,
        prefix: `pk-compose-${Date.now()}`,
      });
    });

    beforeEach(async () => {
      await seedIntegrationDb(kit.prisma);
      await kit.repos.user.invalidateCache({});
      await kit.repos.profile.invalidateCache({});
      await kit.repos.post.invalidateCache({});
      await kit.repos.comment.invalidateCache({});
      await kit.repos.stock.invalidateCache({});
    });

    afterAll(async () => {
      await kit?.disconnect();
    });

    it('owning 1:1 Profile.owner → User', async () => {
      const row = await kit.repos.profile.getById({
        id: 'pr1',
        select: {
          id: true,
          bio: true,
          owner: { select: { uid: true, name: true } },
        },
        setCache: true,
      });
      expect(row?.bio).toBe('mathematician');
      expect(row?.owner).toEqual({ uid: 'u1', name: 'Ada' });
    });

    it('reverse 1:1 User.profile', async () => {
      const row = await kit.repos.user.getById({
        id: 'u1',
        select: {
          uid: true,
          name: true,
          profile: { select: { id: true, bio: true } },
        },
      });
      expect(row?.profile?.id).toBe('pr1');
      expect(row?.profile?.bio).toBe('mathematician');
    });

    it('N:1 dual relations Post.writer / Post.editor', async () => {
      const row = await kit.repos.post.getById({
        id: 'p1',
        select: {
          postId: true,
          title: true,
          writer: { select: { name: true } },
          editor: { select: { name: true } },
        },
      });
      expect(row?.writer?.name).toBe('Ada');
      expect(row?.editor?.name).toBe('Bob');
    });

    it('1:N User.posts with nested take per-parent', async () => {
      const row = await kit.repos.user.getById({
        id: 'u1',
        select: {
          uid: true,
          posts: {
            select: { postId: true, title: true },
            orderBy: { postId: 'asc' },
            take: 1,
          },
        },
      });
      expect(row?.posts).toHaveLength(1);
      expect(row?.posts[0].postId).toBe('p1');
    });

    it('explicit m:n Post → postTags → tag', async () => {
      const row = await kit.repos.post.getById({
        id: 'p1',
        select: {
          postId: true,
          postTags: {
            select: {
              tagId: true,
              tag: { select: { id: true, name: true } },
            },
          },
        },
      });
      const names = row?.postTags
        ?.map((pt: { tag: { name: string } }) => pt.tag.name)
        .sort();
      expect(names).toEqual(['node', 'ts']);
    });

    it('self-relation Comment.replies', async () => {
      const row = await kit.repos.comment.getById({
        id: 'c1',
        select: {
          id: true,
          body: true,
          replies: {
            select: { id: true, body: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      expect(row?.replies?.map((r: { id: string }) => r.id)).toEqual([
        'c2',
        'c3',
      ]);
    });

    it('non-PK reference Stock.warehouseCode → Warehouse.code', async () => {
      const row = await kit.repos.stock.getById({
        id: 's1',
        select: {
          id: true,
          qty: true,
          warehouse: { select: { code: true, name: true } },
        },
      });
      expect(row?.warehouse).toMatchObject({ code: 'WH-A', name: 'Alpha' });
    });

    it('deep nest user → posts → category', async () => {
      const row = await kit.repos.user.getById({
        id: 'u1',
        select: {
          uid: true,
          posts: {
            select: {
              postId: true,
              category: { select: { code: true, label: true } },
            },
          },
        },
      });
      expect(row?.posts?.[0]?.category).toEqual({
        code: 'tech',
        label: 'Technology',
      });
    });

    it('sibling parents do not share aliased relation objects', async () => {
      const rows = await kit.repos.post.getMany({
        where: {},
        select: {
          postId: true,
          writer: { select: { uid: true, name: true } },
        },
        orderBy: { postId: 'asc' },
      });
      expect(rows).toHaveLength(2);
      rows[0].writer.name = 'MUTATED';
      expect(rows[1].writer.name).toBe('Ada');
    });

    it('setCache:false on parent does not populate entity cache', async () => {
      const select = {
        uid: true,
        profile: { select: { id: true, bio: true } },
      };
      await kit.repos.user.getById({
        id: 'u1',
        select,
        setCache: false,
      });

      await kit.prisma.profile.update({
        where: { id: 'pr1' },
        data: { bio: 'changed-underneath' },
      });

      const again = await kit.repos.user.getById({
        id: 'u1',
        select,
        setCache: false,
      });
      expect(again?.profile?.bio).toBe('changed-underneath');
    });
  },
);
