import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPgRedisKit,
  requirePgRedisUrls,
  seedIntegrationDb,
  type PgRedisKit,
} from './pg-redis-kit';

const { databaseUrl, redisUrl } = requirePgRedisUrls();

/** Kept as a focused PG compose smoke; full matrix lives in pg-redis-compose. */
describe.skipIf(!databaseUrl || !redisUrl)(
  'postgres compose (integration)',
  () => {
    let kit: PgRedisKit;

    beforeAll(async () => {
      kit = await createPgRedisKit({
        databaseUrl: databaseUrl!,
        redisUrl: redisUrl!,
        prefix: `pk-pg-compose-${Date.now()}`,
      });
      await seedIntegrationDb(kit.prisma);
    });

    afterAll(async () => {
      await kit?.disconnect();
    });

    it('composes nested writer select via AutoComposer (not Prisma include)', async () => {
      const row = await kit.repos.post.getThrowById({
        id: 'p1',
        select: {
          postId: true,
          title: true,
          writer: { select: { uid: true, name: true } },
        },
      });

      expect(row).toMatchObject({
        postId: 'p1',
        title: 'Hello',
        writer: { uid: 'u1', name: 'Ada' },
      });
    });
  },
);
