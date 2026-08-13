# Migration from raw Prisma

Move from `prisma.model.*` in services/controllers to PrismaKit repositories so cache, compose, locks, and ESLint boundaries stay consistent.

## 1. Install

```bash
pnpm add @prismakit/core @prismakit/nestjs   # Nest
# or: pnpm add @prismakit/core              # plain Node
pnpm add @prismakit/redis ioredis           # optional
pnpm add @prismakit/memory                  # optional (tests / local)
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
```

Wire `PrismaKitModule.forRoot({ prisma, cache?, schemaPath? })` (Nest) or construct repositories with `{ prisma, cache }` after `loadPrismaMetaFromSchema`.

## 2. Map delegates → repository methods

| Before (raw Prisma) | After (repository) |
|---------------------|--------------------|
| `prisma.user.findUnique({ where: { id } })` | `users.getById({ id, select })` |
| `prisma.user.findUniqueOrThrow({ where: { id } })` | `users.getThrowById({ id, select })` |
| `prisma.user.findFirst({ where })` | `users.getFirst({ where, select })` |
| `prisma.user.findMany({ where })` | `users.getMany({ where, select })` |
| `prisma.user.create({ data })` | `users.create({ data, select? })` |
| `prisma.user.update({ where: { id }, data })` | `users.updateById({ id, data })` |
| `prisma.user.delete({ where: { id } })` | `users.deleteById({ id })` |
| `prisma.user.createMany({ data })` | `users.createMany({ data })` |
| `prisma.user.updateMany({ where, data })` | `users.updateMany({ where, data })` |
| `prisma.user.deleteMany({ where })` | `users.deleteMany({ where })` |
| `prisma.user.count({ where })` | `users.count({ where })` |
| `prisma.user.aggregate({ … })` | `users.aggregate({ … })` |
| `prisma.user.groupBy({ … })` | `users.groupBy({ … })` |

Create the repo once:

```typescript
export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { ttl: 86400, sensitiveFields: ['password'] },
}) {}
```

## 3. When to use `setCache`

Cache runs only when the repo has `model` + `cache` **and** you opt in:

| Call site | `setCache` |
|-----------|------------|
| User-facing `getById` / `getThrowById` / list pages | `true` |
| Auth login / password verify | omit (never cache) |
| Uniqueness check before create (`getFirst`) | omit |
| Any read inside a transaction (`tx`) | ignored — cache skipped |

Sensitive fields in `select` never enter the cache even if `setCache: true`.

Optional: `cache: { defaultSetCache: true }` so reads cache by default; still omit or pass `setCache: false` for auth paths.

## 4. Transactions via `TransactionService`

**Before**

```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.order.update({ where: { id }, data: { status: 'PAID' } });
  await tx.stock.update({ where: { id: stockId }, data: { qty: { decrement: 1 } } });
});
```

**After**

```typescript
await this.prismaTx.execTx(
  async (tx) => {
    await this.orders.updateById({
      tx,
      id,
      data: { status: 'PAID' },
      invalidate: 'none',
    });
    await this.stocks.updateById({
      tx,
      id: stockId,
      data: { qty: { decrement: 1 } },
      invalidate: 'none',
    });
  },
  async () => {
    await this.orders.invalidateCache({ id });
    await this.stocks.invalidateCache({ id: stockId });
  },
);
```

Rules: no `$transaction` in services; `invalidate: 'none'` inside `tx`; invalidate in `afterCommit`.

## 5. Select presets

Replace ad-hoc `select` objects with named presets (and keep secrets out of API presets):

```typescript
// types/select-user.type.ts
export const userSelectPresets = {
  minimal: { id: true } satisfies Prisma.UserSelect,
  general: {
    id: true,
    email: true,
    fullName: true,
  } satisfies Prisma.UserSelect,
  withPassword: {
    id: true,
    email: true,
    password: true,
  } satisfies Prisma.UserSelect,
};

export function getUserSelect<K extends keyof typeof userSelectPresets>(key: K) {
  return userSelectPresets[key];
}
```

```typescript
// API
await this.users.getThrowById({
  id,
  select: getUserSelect('general'),
  setCache: true,
});

// Auth
await this.users.getFirst({
  where: { email },
  select: getUserSelect('withPassword'),
});
```

Nested relations in presets are auto-composed when related repos are registered — prefer that over Prisma `include` in services.

## 6. Freeze the boundary

```js
// eslint.config.mjs
import prismakit from '@prismakit/eslint-plugin';
export default [prismakit.configs.recommended];
```

Migrate feature-by-feature: one model → repository → route traffic → enable lint for that path.

See also: [Repository](./repository.md) · [Cache](./cache.md) · [Transactions](./transactions.md)
