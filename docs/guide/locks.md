# Row locks

PrismaKit can run `SELECT … FOR UPDATE` (and related modes) for repositories that declare lock config.

Locks **must** run inside a transaction (`tx`).

## Configure the repository

With Prisma meta loaded (`schemaPath` or `dmmf`), prefer `lock: true`:

```typescript
export class WalletRepository extends defineAppRepo({
  model: 'wallet',
  lock: true, // → table + columns from Prisma meta (@@map / @map)
}) {}
```

Or pass an explicit config:

```typescript
lock: {
  tableName: 'wallets',
  columns: { id: 'id', balance: 'balance' },
}
```

Primary key for `WHERE` comes from meta (`@id` / `@@id`) or defaults to `id`.

## Use in a transaction

```typescript
await this.tx.execTx(async (tx) => {
  const wallet = await this.wallets.getById({
    tx,
    id,
    select: { id: true, balance: true },
    lock: { mode: 'update' },
  });

  await this.wallets.updateById({
    tx,
    id,
    data: { balance: wallet.balance - amount },
    invalidate: 'none',
  });
}, async () => {
  await this.wallets.invalidateCache({ id });
});
```

## Lock options (per call)

```typescript
lock?: {
  mode?: 'update' | 'noKeyUpdate' | 'share' | 'keyShare';
  nowait?: boolean;
  skipLocked?: boolean;
}
```

| Option | Notes |
|--------|-------|
| `mode` | Defaults to `noKeyUpdate` (`FOR NO KEY UPDATE`) |
| `nowait` | Fail immediately if locked |
| `skipLocked` | Skip locked rows — **cannot** combine with `nowait` |

## Rules

- Repo must have `lock` config, or the call throws
- `tx` is required when `lock` is passed
- Never lock outside a transaction
- Prefer short transactions
- Datasource must be **PostgreSQL** (`UnsupportedProviderError` otherwise)
- Locked reads never write cache (transaction path)

Repo-level locks (`getById` / `getFirst` / `getMany` with `lock:`) are covered by Nest integration tests against real Postgres — see [Production](production.md).

See also [Transactions](transactions.md) and [Rules](../RULES.md).
