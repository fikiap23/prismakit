import { Inject, Injectable } from '@nestjs/common';

import { PRISMAKIT_PRISMA } from './tokens';

/** Minimal Prisma client shape needed for transactions. */
export type PrismaClientWithTransaction = {
  $transaction: <T>(
    fn: (tx: unknown) => Promise<T>,
    options?: unknown,
  ) => Promise<T>;
};

/**
 * Transaction boundary for services/helpers.
 * Feature code must use this — never inject PrismaClient / call `$transaction` directly.
 */
@Injectable()
export class TransactionService {
  constructor(
    @Inject(PRISMAKIT_PRISMA)
    private readonly prisma: PrismaClientWithTransaction,
  ) {}

  async execTx<T>(
    fn: (tx: unknown) => Promise<T>,
    afterCommit?: () => Promise<void>,
  ): Promise<T> {
    const result = await this.prisma.$transaction(fn);
    if (afterCommit) {
      await afterCommit();
    }
    return result;
  }
}
