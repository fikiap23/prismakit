---
name: prismakit-nestjs
description: >-
  PrismaKit NestJS adapter: PrismaKitModule.forRoot/forRootAsync wiring, injectable repositories via
  createDefineRepo/defineInjectableRepository, TransactionService.execTx with afterCommit invalidation,
  and PRISMAKIT_* DI tokens. Use when working with @prismakit/nestjs, Nest feature modules that need
  Prisma data access, or Nest transactions and cache invalidation.
---

# PrismaKit NestJS

Adapter for NestJS. The data-access contract (layering, cache, compose, locks, ESLint) lives in skill `prismakit` — follow it. This skill covers module wiring, injectable repos, and `TransactionService`.

## Bootstrap

```bash
pnpm add @prismakit/core @prismakit/nestjs
pnpm add @prismakit/redis ioredis
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
```

```typescript
import { Module } from '@nestjs/common';
import { PrismaKitModule } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';
import { Prisma } from '@prisma/client';

@Module({
  imports: [
    PrismaKitModule.forRoot({
      prisma: prismaClient,
      cache: new RedisCacheAdapter({ prefix: 'myapp' }),
      cacheModels: ['user', 'product'],
      schemaPath: 'prisma/schema.prisma', // default; Prisma 5/6: dmmf: Prisma.dmmf
      validateCompose: true,
      compose: { maxDepth: 6, parallel: true, setCache: true },
    }),
  ],
})
export class AppModule {}
```

`forRootAsync` when cache/URL come from `ConfigService` — see [examples.md](examples.md).

`schemaPath` defaults to `prisma/schema.prisma`. Always load Prisma meta (`dmmf` or `schemaPath`) so auto-compose and `lock: true` resolve FKs/`@@map` from the schema — no relation-alias map.

## Factory (one default)

Bind `Prisma.TypeMap` once, then define repos with runtime options only.

```typescript
// src/infrastructure/prisma/define-repo.ts
import { createDefineRepo } from '@prismakit/nestjs';
import type { Prisma } from '@prisma/client';

export const defineRepo = createDefineRepo<Prisma.TypeMap>();
```

```typescript
// src/modules/users/repositories/user.repository.ts
import { Prisma } from '@prisma/client';
import { defineRepo } from '../../../infrastructure/prisma/define-repo';

const DAY = 86_400;

export const UserRepository = defineRepo({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: DAY, nullTtl: 60, sensitiveFields: ['password'] },
  lock: true,
});
export type UserRepository = InstanceType<typeof UserRepository>;
```

Escape hatches (do not use as the app default):

- `defineInjectableRepository` from `@prismakit/nestjs` (package alias `defineRepository`) — phantoms + payload HKT when TypeMap is unavailable.
- `createInjectableRepository` without a types bag — thin, results are `unknown`. Alias: `createPrismaRepository`.

Do not import `defineRepo` from `@prismakit/nestjs` in apps that already bind `createDefineRepo` as `defineRepo`.

## Register and inject

```typescript
@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
```

```typescript
@Injectable()
export class UserService {
  constructor(private readonly users: UserRepository) {}
}
```

**Do not** inject `PRISMAKIT_PRISMA`, `PrismaClient`, or `PrismaService` in services, helpers, controllers, or processors. The prisma token exists so injectable repositories can wire `RepositoryDeps`.

Rare custom repos (dashboard/health) may inject `PRISMAKIT_PRISMA` **only** if the class lives under `**/repositories/**`.

## Transactions

```typescript
import { TransactionService } from '@prismakit/nestjs';

constructor(
  private readonly tx: TransactionService,
  private readonly orders: OrderRepository,
  private readonly stocks: StockRepository,
) {}

await this.tx.execTx(
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
    await this.orders.invalidateCache({});
    await this.stocks.invalidateCache({ id: input.stockId });
  },
);
```

Rules:

- `TransactionService.execTx(fn, afterCommit?, options?)` — never `prisma.$transaction` in feature code.
- Pass `tx` into every repo call in the unit of work.
- Writes inside tx: `invalidate: 'none'`.
- `afterCommit` runs only after `$transaction` resolves.
- Keep transactions short. Do not mix cached reads with half-committed writes.

Optional third argument: `{ maxWait, timeout, isolationLevel }`.

## Row locks

Repo must have `lock` config. Call must pass `tx`.

```typescript
await this.tx.execTx(
  async (tx) => {
    const wallet = await this.wallets.getById({
      tx,
      id,
      select: { id: true, balance: true },
      lock: { mode: 'update' },
    });
    await this.wallets.updateById({
      tx,
      id,
      data: { balance: wallet!.balance - amount },
      invalidate: 'none',
    });
  },
  async () => {
    await this.wallets.invalidateCache({ id });
  },
);
```

## Cache typing DX

When the repo options include `cache`, TypeScript exposes `setCache`, `cacheTags`, mutation `invalidate`/`tags`, and `invalidateCache`. Without `cache`, those fields are omitted — do not pass them.

Production: set `cacheModels` to the same keys that enable `cache` on repositories. Omit = fail-open.

`cache.defaultSetCache: true` makes user-facing reads cache by default; still pass `setCache: false` on auth/uniqueness.

## What the module provides

| Token / provider | Who may inject |
|------------------|----------------|
| `TransactionService` | Services / helpers |
| `RepositoryRegistry` | Kit internals / compose |
| `AutoComposer` | Kit internals / compose |
| `PRISMAKIT_PRISMA` | **Repositories only** |
| `PRISMAKIT_CACHE` | Repositories / kit internals |
| `PRISMAKIT_OPTIONS` | Kit internals |

## Ops

| Option | Use |
|--------|-----|
| `cacheModels` | Strict allowlist of cached model keys |
| `validateCompose: true` | Assert compose-safe selects on boot |
| `compose` | `{ maxDepth, parallel, setCache }` |
| `telemetry` | `{ enabled: true, onEvent }` |
| `queryLog` | `{ slowThreshold, onSlowQuery }` — enables telemetry |
| `autoRegisterModels` | `true` or `string[]` — stub repos for compose-only models |

## Scaffolding

```bash
npx prismakit generate product --cache
npx prismakit generate product --cache --full --route products
```

Repo-only: add the class to feature `providers`. `--full`: import `*Module` in `AppModule`. Then `npx prismakit validate`.

Enable ESLint `prismakit.configs.recommended` (see skill `prismakit`).

## Clean code (Nest)

- One `defineRepo` binder under `src/infrastructure/prisma/`. Do not call `createDefineRepo` per feature.
- Feature modules own their repository providers; do not make every repo global.
- Controllers stay HTTP-only: map DTO → service method. No repository calls in controllers.
- Select presets live next to the repository (`minimal` / `general` / `withPassword`).
- Name TTL constants once; reuse in repo `cache` config.

## Anti-patterns (BAD → GOOD)

```typescript
// BAD
constructor(private readonly prisma: PrismaClient) {}
constructor(@Inject(PRISMAKIT_PRISMA) private readonly prisma: PrismaClient) {}
await this.prisma.$transaction(async (tx) => { /* ... */ });
await this.products.updateById({ tx, id, data }); // invalidates inside tx
await this.users.getFirst({ where: { email }, select: { id: true }, setCache: true });

// GOOD
constructor(
  private readonly tx: TransactionService,
  private readonly products: ProductRepository,
) {}
await this.tx.execTx(
  async (tx) => {
    await this.products.updateById({ tx, id, data, invalidate: 'none' });
  },
  async () => {
    await this.products.invalidateCache({ id });
  },
);
await this.users.getFirst({ where: { email }, select: { id: true } });
```

## Before you finish

Copy and complete [review-checklist.md](review-checklist.md).

- Module options and tokens: [reference.md](reference.md)
- Production wiring snippets: [examples.md](examples.md)
- Core contract: skill `prismakit`
