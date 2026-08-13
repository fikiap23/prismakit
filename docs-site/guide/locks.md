# Row locks

Opt-in pessimistic locks via `SELECT … FOR UPDATE` for read-modify-write races.

## Setup

```typescript
defineAppRepo({
  model: 'order',
  lock: true, // table + columns from Prisma meta
});
```

Prefer `lock: true` with `schemaPath` / DMMF so column maps cannot drift. Explicit override: `{ tableName, columns? }`.

## Usage

Always pair `lock` with `tx`:

```typescript
await this.tx.execTx(async (tx) => {
  const order = await this.orders.getThrowById({
    tx,
    id: orderId,
    select: getOrderSelect('general'),
    lock: { mode: 'noKeyUpdate' },
  });
  // mutate based on locked row…
}, afterCommit);
```

| Mode | SQL | Typical use |
|------|-----|-------------|
| `noKeyUpdate` (default) | `FOR NO KEY UPDATE` | Non-key field updates |
| `update` | `FOR UPDATE` | Full row lock |
| `share` / `keyShare` | `FOR SHARE` / `FOR KEY SHARE` | Read locks |

Locks bypass cache. Scope: `getById` / `getThrowById` (and related lock helpers for bulk).

Full guide: [docs/guide/locks.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/locks.md)
