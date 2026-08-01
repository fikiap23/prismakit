import { Inject, Injectable } from '@nestjs/common';

import { PRISMAKIT_PRISMA } from './tokens';

/** Minimal Prisma client shape needed for transactions. */
export type PrismaClientWithTransaction = {
  $transaction: <T>(
    fn: (tx: unknown) => Promise<T>,
    options?: unknown,
  ) => Promise<T>;
};

export type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?:
    | 'ReadUncommitted'
    | 'ReadCommitted'
    | 'RepeatableRead'
    | 'Serializable'
    | string;
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

  /**
   * Run `fn` inside `prisma.$transaction`. Optionally run `afterCommit` after
   * the transaction succeeds (e.g. cache invalidation).
   *
   * Generic `TClient` lets callers type the tx as their Prisma transaction client:
   * ```ts
   * await tx.execTx<User, Prisma.TransactionClient>(async (tx) => { ... });
   * ```
   */
  async execTx<T, TClient = unknown>(
    fn: (tx: TClient) => Promise<T>,
    afterCommit?: () => Promise<void>,
    options?: TransactionOptions,
  ): Promise<T> {
    const result = await this.prisma.$transaction(
      (tx) => fn(tx as TClient),
      options,
    );
    if (afterCommit) {
      await afterCommit();
    }
    return result;
  }
}
