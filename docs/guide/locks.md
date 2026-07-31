# Row locks

PrismaKit can run `SELECT … FOR UPDATE` (and related modes) for repositories that declare lock config.

Locks **must** run inside a transaction (`tx`).

## Configure the repository

With DMMF loaded (`dmmf: Prisma.dmmf`), prefer the client model key or `lock: true`:

```typescript
export const WalletRepository = createInjectableRepository({
  model: 'wallet',
  lock: true, // → table + columns from Prisma meta (@@map / @map)
});

// or explicit client key / Pascal name / @@map table:
lock: 'wallet'
lock: 'Wallet'
lock: 'wallets'
```

Legacy: pass a DB table name resolved from `schema.prisma`:

```typescript
export const WalletRepository = createInjectableRepository({
  model: 'wallet',
  scalarFields: Prisma.WalletScalarFieldEnum,
  lock: 'wallets',
  // schemaPath: 'prisma/schema.prisma', // if not at default path
});
```

Or pass an explicit config:

```typescript
lock: {
  tableName: 'wallets',
  columns: { id: 'id', balance: 'balance' },
}
```

`lock: 'wallets'` / `lock: 'wallet'` resolve via Prisma meta when available, otherwise `buildLockConfigFromSchema`.

Primary key for `WHERE` comes from DMMF (`primaryKey`) or defaults to `id`.

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

See also [Transactions](transactions.md) and [Rules](../RULES.md).
