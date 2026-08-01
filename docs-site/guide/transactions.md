# Transactions

Use one transaction boundary for multi-step writes. In NestJS that boundary is `TransactionService.execTx`.

## Pattern

```typescript
await this.prismaTx.execTx(
  async (tx) => {
    await this.orders.updateById({
      tx,
      id,
      data: { status: 'PAID' },
      invalidate: 'none',
    });
  },
  async () => {
    await this.orders.invalidateCache({ id });
  },
);
```

| Do | Don't |
|----|-------|
| `TransactionService.execTx` | `$transaction` in services |
| Pass `tx` into every repo call | Mix cached reads with half-committed writes |
| `invalidate: 'none'` inside `tx` | Auto-invalidate inside `tx` |
| `invalidateCache` in `afterCommit` | Forget post-commit invalidation |

Cache is skipped whenever `tx` is present.

Full guide: [docs/guide/transactions.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/transactions.md)
