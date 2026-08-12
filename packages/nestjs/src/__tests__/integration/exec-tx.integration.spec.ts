import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPgRedisKit,
  requirePgRedisUrls,
  seedIntegrationDb,
  type PgRedisKit,
} from '../../../../core/src/__tests__/integration/pg-redis-kit';
import { TransactionService } from '../../transaction.service';

const { databaseUrl, redisUrl } = requirePgRedisUrls();

describe.skipIf(!databaseUrl || !redisUrl)(
  'TransactionService execTx + afterCommit (integration)',
  () => {
    let kit: PgRedisKit;
    let tx: TransactionService;

    beforeAll(async () => {
      kit = await createPgRedisKit({
        databaseUrl: databaseUrl!,
        redisUrl: redisUrl!,
        prefix: `pk-nest-tx-${Date.now()}`,
        cache: { ttl: 60, defaultSetCache: true, sensitiveFields: ['password'] },
      });
      await seedIntegrationDb(kit.prisma);
      tx = new TransactionService(kit.prisma);
      await kit.repos.user.invalidateCache({});
    });

    afterAll(async () => {
      await kit?.disconnect();
    });

    it('invalidates cache in afterCommit after successful execTx', async () => {
      const cached = await kit.repos.user.getById({
        id: 'u1',
        select: { uid: true, name: true },
        setCache: true,
      });
      expect(cached?.name).toBe('Ada');

      await tx.execTx(
        async (client) => {
          await kit.repos.user.updateById({
            tx: client,
            id: 'u1',
            data: { name: 'Updated' },
            select: { uid: true },
            invalidate: 'none',
          });
        },
        async () => {
          await kit.repos.user.invalidateCache({ id: 'u1' });
        },
      );

      const after = await kit.repos.user.getById({
        id: 'u1',
        select: { uid: true, name: true },
        setCache: true,
      });
      expect(after?.name).toBe('Updated');
    });

    it('does not run afterCommit when the transaction rolls back', async () => {
      let afterCommitRan = false;
      await expect(
        tx.execTx(
          async (client) => {
            await kit.repos.user.updateById({
              tx: client,
              id: 'u1',
              data: { name: 'RollbackMe' },
              select: { uid: true },
              invalidate: 'none',
            });
            throw new Error('force-rollback');
          },
          async () => {
            afterCommitRan = true;
            await kit.repos.user.invalidateCache({ id: 'u1' });
          },
        ),
      ).rejects.toThrow('force-rollback');

      expect(afterCommitRan).toBe(false);
      const row = await kit.repos.user.getById({
        id: 'u1',
        select: { uid: true, name: true },
        setCache: false,
      });
      expect(row?.name).toBe('Updated');
    });
  },
);
