import { describe, it, expect } from 'vitest';
import { TransactionService } from '../transaction.service';

describe('TransactionService', () => {
  it('runs afterCommit only after successful transaction', async () => {
    const calls: string[] = [];
    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<string>) => {
        calls.push('tx');
        return fn({});
      },
    };
    const tx = new TransactionService(prisma as any);
    const result = await tx.execTx(
      async () => {
        calls.push('work');
        return 'ok';
      },
      async () => {
        calls.push('after');
      },
    );
    expect(result).toBe('ok');
    expect(calls).toEqual(['tx', 'work', 'after']);
  });

  it('skips afterCommit on failure', async () => {
    const prisma = {
      $transaction: async () => {
        throw new Error('boom');
      },
    };
    const tx = new TransactionService(prisma as any);
    let after = false;
    await expect(
      tx.execTx(
        async () => 'x',
        async () => {
          after = true;
        },
      ),
    ).rejects.toThrow('boom');
    expect(after).toBe(false);
  });
});
