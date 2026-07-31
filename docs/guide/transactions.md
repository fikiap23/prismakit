# Transactions

Use one transaction boundary for multi-step writes. In NestJS that boundary is `TransactionService`.

## NestJS pattern

```typescript
import { TransactionService } from '@prismakit/nestjs';

constructor(
  private readonly tx: TransactionService,
  private readonly orders: OrderRepository,
  private readonly stocks: StockRepository,
) {}

async handleCheckout(input: CheckoutInput) {
  return this.tx.execTx(
    async (tx) => {
      const order = await this.orders.create({
        tx,
        data: { /* ... */ },
        select: { id: true },
        invalidate: 'none',
      });

      await this.stocks.updateById({
        tx,
        id: input.stockId,
        data: { qty: { decrement: input.qty } },
        invalidate: 'none',
      });

      return order;
    },
    async () => {
      // after successful commit
      await this.orders.invalidateCache({ /* tags if needed */ });
      await this.stocks.invalidateCache({ id: input.stockId });
    },
  );
}
```

### Why `invalidate: 'none'` inside `tx`?

Cache must not change until the DB commit succeeds. If the transaction rolls back, you must not have cleared cache keys.

### Why `afterCommit`?

`execTx` runs `afterCommit` only after `$transaction` resolves successfully.

## Rules

| Do | Don't |
|----|-------|
| `TransactionService.execTx` | `$transaction` in services |
| Pass `tx` into every repo call in the unit of work | Mix cached reads with half-committed writes |
| `invalidate: 'none'` on writes inside `tx` | Auto-invalidate inside `tx` |
| `invalidateCache` in `afterCommit` | Forget invalidation after commit |

## Plain Node (no Nest)

```typescript
await prisma.$transaction(async (tx) => {
  await repo.updateById({ tx, id, data, invalidate: 'none' });
});
await repo.invalidateCache({ id });
```

Prefer wrapping this in your own helper so call sites stay consistent.

## Locks + transactions

Row locks require `tx`. See [Locks](locks.md).

## ESLint

`prismakit/require-transaction-service` flags raw `.$transaction` outside allowed paths.

See [ESLint reference](../reference/eslint.md).
