---
name: prismakit
description: >-
  PrismaKit data-access contract for Prisma apps: repository-only access via createRepository,
  cache-aside with setCache/invalidate, auto-compose relations, row locks, telemetry, prismakit CLI,
  and @prismakit/eslint-plugin. Use when working with @prismakit/core, files under repositories/,
  CacheAdapter/Redis caching of Prisma reads, or when code injects PrismaClient outside a repository.
---

# PrismaKit

Framework-agnostic Prisma repository kit. Not a Prisma fork. Only repositories talk to Prisma.

NestJS apps: also load skill `prismakit-nestjs` after this contract.

## Non-negotiables

Violations are bugs. Enforce with `@prismakit/eslint-plugin` + this skill.

| Forbidden | Why |
|-----------|-----|
| `PrismaClient` / `PrismaService` in services, helpers, controllers, processors | Bypasses cache, compose, invalidation |
| `prisma.<model>.*` outside `**/repositories/**` | Same |
| `$transaction` in Nest feature code | Use `TransactionService.execTx` |
| `setCache: true` on auth / uniqueness `getFirst` | Stale nulls / race hazards |
| Caching selects with `password` (or other `sensitiveFields`) | Security |
| Row `lock` without `tx` | Lock must live inside a transaction |
| Prisma `include` for relations | Use relation keys in `select` (auto-compose) |

| Required | How |
|----------|-----|
| Reads/writes | `*Repository` from `createRepository` / Nest factories |
| Tx writes | `invalidate: 'none'` then `invalidateCache` after commit |
| User-facing reads | `setCache: true` when the repo has cache config |
| Relations in `select` | `model` + Prisma meta loaded (or `scalarFields` when meta unavailable) |
| ESLint | `prismakit.configs.recommended` |

## Layers

```
Controller / route handler → Service → Helper → Repository → Prisma / CacheAdapter
```

Helpers may inject repositories — never the Prisma client.

## Decision table

| Task | Use |
|------|-----|
| New repository | `createRepository` (core) or Nest `defineRepo` — see `prismakit-nestjs` |
| User-facing get by id | `getThrowById` / `getById` + `setCache: true` |
| Existence / uniqueness / auth | `getFirst` — **no** `setCache` |
| List | `getMany` + `setCache: true` + optional `cacheTags` |
| Paginated list | `getManyPaginate` |
| Large / infinite list | `getManyCursor` (with `cursor` → default `skip: 1`) |
| Count / exists check | `count` / `exists` (no `setCache` on auth paths) |
| Composite PK row | `id: { a, b }` object — kit maps to Prisma `a_b: { a, b }` |
| Aggregations | `aggregate` / `groupBy` |
| Create / update / delete | matching mutation; default invalidation is enough outside tx |
| Multi-step write | one transaction; pass `tx` into every repo call |
| `SELECT … FOR UPDATE` | `lock: { mode: 'update' }` **inside** `tx` |
| Load relations | nested objects in `select`, not Prisma `include` |

## Create a repository (core)

```typescript
import { PrismaClient } from '@prisma/client';
import { createRepository } from '@prismakit/core';
import { RedisCacheAdapter } from '@prismakit/redis';

const DAY = 86_400;

const UserRepoClass = createRepository({
  model: 'user',
  cache: { ttl: DAY, nullTtl: 60, sensitiveFields: ['password'] },
  lock: true, // table + columns resolved from Prisma schema meta
});

const prisma = new PrismaClient();
const cache = new RedisCacheAdapter({ prefix: 'myapp' });
export const users = new UserRepoClass({ prisma, cache });
```

`defineRepository` is an alias of `createRepository` in core. Note: `createPrismaRepository` is also an alias in core, but in `@prismakit/nestjs` it aliases `createInjectableRepository` instead — avoid using it to prevent confusion.

**NestJS apps:** use `createDefineRepo` / `defineAppRepo` with app-wide cache defaults instead — see skill `prismakit-nestjs`.

| Option | Description |
|--------|-------------|
| `model` | Prisma client key (`prisma.user` → `'user'`). Needed for cache + compose. |
| `scalarFields` | Usually `Prisma.XScalarFieldEnum`. **Optional** when `schemaPath` / DMMF meta is loaded (default since 3.1). |
| `cache` | `CacheOptions` or `true` (uses app defaults when bound via `createDefineRepo`). |
| `lock` | `true` / client key / `@@map` table / `{ tableName, columns }`. |
| `primaryKey` | Override only. Defaults to schema `@id` / `@@id` (composite `string[]`) or `id`. |
| `schemaPath` | Path to `schema.prisma` when meta is not loaded globally. Default: `prisma/schema.prisma`. |
| `getDelegate` | Optional. Defaults to `(c) => c[model]`. |

Put files under `**/repositories/**`. Keep Prisma client construction under `**/infrastructure/prisma/**`.

## Reads

Always pass an explicit `select`. Never rely on “fetch all columns”.

```typescript
await users.getThrowById({
  id,
  select: { id: true, email: true, name: true },
  setCache: true,
});

await users.getFirst({
  where: { email },
  select: { id: true, password: true },
  // no setCache — auth / uniqueness
});
```

| Method | Returns |
|--------|---------|
| `getById` | payload or `null` |
| `getThrowById` | payload; throws if missing |
| `getFirst` | first match or `null` |
| `getMany` | array (`take` / `skip` / `orderBy`) |
| `getManyPaginate` | `{ data, meta: { page, pageSize, totalItems, totalPages } }` |
| `getManyCursor` | `{ data, nextCursor, hasMore }` |
| `getThrowFirst` | first match; throws if missing |
| `count` / `exists` | `number` / `boolean` |
| `aggregate` / `groupBy` | Prisma delegate results |

`id` is `string` or `Record<string, string>` for composite PKs (object form for `@@id([a,b])`).

`getManyCursor`: when `cursor` is set, default `skip` is `1` so the cursor row is not repeated. Pass `skip: 0` only for inclusive semantics.

## Writes

| Method | Default `invalidate` |
|--------|----------------------|
| `create` / `createMany` / `createManyAndReturn` | `queries` |
| `updateById` / `update` / `updateMany` / `updateManyAndReturn` | `all` |
| `upsert` / `upsertMany` | `all` |
| `deleteById` / `delete` / `deleteMany` | `all` |
| `queryRaw` / `executeRaw` | none (raw SQL — no cache) |

```typescript
await users.updateById({
  id,
  data: { name: 'Ada' },
  select: { id: true, name: true },
});
```

## Cache

A read uses the cache **only when all of these are true**:

1. `setCache: true` (or repo `cache.defaultSetCache: true` and caller did not pass `false`)
2. Repository has `model` + `cache` config
3. No `tx` (transactions never cache)
4. Method is not disabled in `cache.methods`
5. `select` does not include a sensitive field (default includes `password`)

If Redis is down, `RedisCacheAdapter` **fails open** — queries still hit Prisma.

| Scenario | `setCache` |
|----------|------------|
| API detail / list | `true` |
| Auth, uniqueness, JWT lookup | omit / `false` |
| Inside `tx` | ignored |

Repository `cache` is the source of truth. Omit `cacheModels` (fail-open). An optional allowlist throws if a cached repo's model is missing from the list.

`setCache` / `cacheTags` / `invalidate` / `invalidateCache` exist on the type **only** when the repo has `cache` config. Do not force them on uncached repos.

## Transactions (plain Node)

```typescript
await prisma.$transaction(async (tx) => {
  await users.updateById({ tx, id, data, invalidate: 'none' });
});
await users.invalidateCache({ id });
```

Wrap this in an app helper so call sites stay consistent. Nest: `TransactionService.execTx` (skill `prismakit-nestjs`).

Never invalidate cache inside the transaction. If the tx rolls back, cache must still be valid.

## Auto-compose

Relations in `select` load through other registered repositories — not Prisma `include`.

```typescript
await posts.getThrowById({
  id,
  select: {
    id: true,
    title: true,
    author: { select: { id: true, name: true } },
  },
  setCache: true,
});
```

Requirements: source repo has `model`; `scalarFields` **or** Prisma meta loaded (`loadPrismaMetaFromDmmf(Prisma.dmmf)` on Prisma 5/6, `loadPrismaMetaFromSchema('prisma/schema.prisma')` on Prisma 7); related model repos are registered.

AutoComposer injects the target primary key into nested selects even if omitted. Relation field names resolve from schema / DMMF meta (`schemaPath` defaults to `prisma/schema.prisma`).

## Row locks

Repo must declare `lock`. Call must pass `tx`. Default mode is `noKeyUpdate`. `skipLocked` cannot combine with `nowait`. Prefer short transactions.

```typescript
await prisma.$transaction(async (tx) => {
  const row = await wallets.getById({
    tx,
    id,
    select: { id: true, balance: true },
    lock: { mode: 'update' },
  });
  await wallets.updateById({
    tx,
    id,
    data: { balance: row!.balance - amount },
    invalidate: 'none',
  });
});
await wallets.invalidateCache({ id });
```

## CLI and ESLint

```bash
npx prismakit generate <name> --cache
npx prismakit generate <name> --cache --full --route <path>
npx prismakit validate --auto-register
```

```js
// eslint.config.mjs
import prismakit from '@prismakit/eslint-plugin';
export default [prismakit.configs.recommended];
```

Allowed Prisma usage: `**/repositories/**`, `**/infrastructure/prisma/**`. Rules: `no-prisma-service-outside-repos`, `no-direct-prisma-delegate`, `require-transaction-service`, `require-cached-repo-provider`.

## Observability

- Core: `setTelemetry({ enabled, onEvent, slowThreshold })` or Nest `telemetry` / `queryLog.slowThreshold`.
- Optional: `@prismakit/opentelemetry` → `createPrismaKitTelemetry({ slowThreshold })`.
- Events: `cache.hit` / `cache.miss` / `cache.bypass` / `cache.invalidate` / `cache.error`, `compose.*`, `lock.*`, `stampede.*`, `query.complete` / `query.slow`.

## Clean code

- One repository per Prisma model, file `*.repository.ts` under `repositories/`.
- Select presets as `satisfies Prisma.XSelect`: `minimal` (no cache), `general` (API, cacheable), `withPassword` (auth only, never cached). Keep presets next to the repo; controllers never build selects.
- Named TTL constants (`const DAY = 86_400`), not magic numbers scattered in call sites.
- Pass `tx` into **every** repo call in a unit of work. Do not mix cached reads with half-committed writes.
- Tests: `@prismakit/memory` `MemoryCacheAdapter`. Production: `@prismakit/redis`.
- Library CI proves PG+Redis paths under `FORCE_INTEGRATION=1` (CRUD, compose, locks, stampede, fail-open).

## Anti-patterns (BAD → GOOD)

```typescript
// BAD — Prisma in a service
constructor(private readonly prisma: PrismaClient) {}
await this.prisma.user.findUnique({ where: { id } });
await this.prisma.$transaction(async (tx) => { /* ... */ });
await this.prisma.post.findUnique({ include: { author: true } });
await users.getFirst({ where: { email }, select: { id: true }, setCache: true });
await users.getById({ id, select: { password: true }, setCache: true });
await wallets.getById({ id, select: { id: true }, lock: { mode: 'update' } }); // no tx
await users.updateById({ tx, id, data }); // auto-invalidate inside tx

// GOOD
constructor(private readonly users: UserRepository) {}
await this.users.getById({ id, select: { id: true, email: true }, setCache: true });
await prisma.$transaction(async (tx) => {
  await this.users.updateById({ tx, id, data, invalidate: 'none' });
});
await this.users.invalidateCache({ id });
await this.posts.getById({
  id,
  select: { id: true, author: { select: { id: true, name: true } } },
  setCache: true,
});
await this.users.getFirst({ where: { email }, select: { id: true } }); // no setCache
await this.users.getFirst({
  where: { email },
  select: { id: true, password: true }, // auth; never setCache
});
await prisma.$transaction(async (tx) => {
  await this.wallets.getById({
    tx, id, select: { id: true, balance: true }, lock: { mode: 'update' },
  });
});
```

## Before you finish

Copy and complete [review-checklist.md](review-checklist.md).

- Method/options detail: [reference.md](reference.md)
- End-to-end snippets: [examples.md](examples.md)
- NestJS wiring: skill `prismakit-nestjs`
