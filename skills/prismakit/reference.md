# PrismaKit core reference

API surface for `@prismakit/core` **4.0** (pre-stable). Read [SKILL.md](SKILL.md) first.

## Packages

| Package | Role |
|---------|------|
| `@prismakit/core` | `createRepository`, AutoComposer, locks, pagination, `CacheAdapter` |
| `@prismakit/redis` | `RedisCacheAdapter`, `createRedisJsonReviver` |
| `@prismakit/memory` | `MemoryCacheAdapter` (tests / local) |
| `@prismakit/opentelemetry` | Map telemetry → OTel metrics/spans |
| `@prismakit/cli` | `prismakit generate / validate / skills` |
| `@prismakit/eslint-plugin` | Repository-only data-access rules |

Node ≥ 20. Install:

```bash
pnpm add @prismakit/core
pnpm add @prismakit/redis ioredis          # optional production cache
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
# tests: pnpm add -D @prismakit/memory
# optional: pnpm add @prismakit/opentelemetry @opentelemetry/api
```

## Factory

```typescript
createRepository(options) → new RepoClass(deps: RepositoryDeps)
```

Public factory: **`createRepository` only**.

`RepositoryDeps`: `{ prisma, cache?, registry?, autoCompose? }`.

### `RepositoryOptions`

| Field | Type | Notes |
|-------|------|-------|
| `model` | `string` | Client key. **Required.** |
| `cache` | `CacheOptions \| true` | `true` → `{ ttl: 86400, sensitiveFields: ['password'] }`. |
| `lock` | `true \| RepositoryLockConfig` | `true` resolves table/columns from Prisma meta. |
| `toPayload` | `(data) => payload` | Default identity. |

Scalars, primary key, and relations come from Prisma meta (`loadPrismaMetaFromSchema` / `loadPrismaMetaFromDmmf`).

`RepositoryLockConfig`: `{ tableName: string; columns?: Record<string, string> }`.

## Repository methods

All methods accept optional `tx`. Cached repos also accept cache fields (see below). `id` is `string | Record<string, string>`.

### Reads

| Method | Extra args | Returns |
|--------|------------|---------|
| `getById` | `id`, `select?`, `lock?`, `setCache?` | `T \| null` |
| `getThrowById` | same | `T` (throws if missing) |
| `getFirst` | `where?`, `select?`, `lock?`, `setCache?`, `cacheTags?`, `orderBy?` | `T \| null` |
| `getThrowFirst` | same as `getFirst` | `T` (throws if missing) |
| `getMany` | `where?`, `select?`, `orderBy?`, `take?`, `skip?`, `lock?`, `setCache?`, `cacheTags?` | `T[]` |
| `getManyPaginate` | `where?`, `select?`, `orderBy?`, `page?`, `pageSize?`, `setCache?`, `cacheTags?` | `PaginatedResult<T>` |
| `getManyCursor` | `where?`, `select?`, `orderBy?`, `cursor?`, `take?`, `skip?`, `setCache?`, `cacheTags?` | `CursorPage<T>`; with `cursor`, default `skip: 1` |
| `count` | `where?`, `setCache?`, `cacheTags?` | `number` |
| `exists` | `where?`, `setCache?`, `cacheTags?` | `boolean` |
| `aggregate` | Prisma aggregate args + `setCache?`, `cacheTags?` | delegate result |
| `groupBy` | Prisma groupBy args + `setCache?`, `cacheTags?` | delegate result |

`PaginatedResult<T>`:

```typescript
{ data: T[]; meta: { page: number; pageSize: number; totalItems: number; totalPages: number } }
```

`cacheTags` may be `string[]` or `(where?) => string[]`.

### Writes

| Method | Extra args | Default `invalidate` | Returns |
|--------|------------|----------------------|---------|
| `create` | `data`, `select?`, `invalidate?`, `tags?` | `queries` | `T` |
| `createMany` | `data[]`, `skipDuplicates?`, `invalidate?`, `tags?` | `queries` | `{ count }` |
| `updateById` | `id`, `data`, `select?`, `invalidate?`, `tags?` | `all` | `T` |
| `updateMany` | `where`, `data`, `invalidate?`, `tags?` | `all` | `{ count }` |
| `upsert` | `where`, `create`, `update`, `select?`, `invalidate?`, `tags?` | `all` | `T` |
| `deleteById` | `id`, `select?`, `invalidate?`, `tags?` | `all` | `T` |
| `deleteMany` | `where`, `invalidate?`, `tags?` | `all` | `{ count }` |
| `update` | `where`, `data`, `select?`, `invalidate?`, `tags?` | `all` | `T` |
| `delete` | `where`, `select?`, `invalidate?`, `tags?` | `all` | `T` |
| `createManyAndReturn` | `data[]`, `select?`, `skipDuplicates?`, `invalidate?`, `tags?` | `queries` | `T[]` |
| `updateManyAndReturn` | `where`, `data`, `select?`, `invalidate?`, `tags?` | `all` | `T[]` |
| `upsertMany` | `data[]`, `skipDuplicates?`, `invalidate?`, `tags?` | `all` | `{ count }` |
| `queryRaw` | `sql`, `...params` | — | raw result |
| `executeRaw` | `sql`, `...params` | — | `number` (affected rows) |

Mutation `tags`: `string[] | null | undefined | ((result) => string[] | null | undefined)`.

### Manual invalidation (cached repos only)

```typescript
await repo.invalidateCache({ id?: string; tags?: string[] });
```

## Cache

### When a read hits cache

1. `setCache: true` **or** `cache.defaultSetCache: true` without `setCache: false`
2. `model` + `cache` config present
3. No `tx`
4. Method not `{ enabled: false }` in `cache.methods`
5. `select` has no `sensitiveFields` (default `['password']`)

### `CacheOptions`

| Field | Default | Notes |
|-------|---------|-------|
| `ttl` | `86400` | Entity TTL (seconds). |
| `nullTtl` | — | Negative cache for null results. |
| `sensitiveFields` | `['password']` | Selects containing these never cache. |
| `methods` | — | Per-method `{ enabled?, ttl? }`. |
| `defaultSetCache` | `false` | Reads cache unless caller passes `setCache: false`. |
| `stampede` | see below | Per-repo stampede overrides. |
| `strictInvalidation` | `false` | When true, invalidation failures rethrow. |

### `InvalidateMode`

| Mode | Effect |
|------|--------|
| `all` | Entity keys for `id` (or all entities) + query index |
| `entity` | Entity keys only |
| `queries` | Query index only |
| `none` | Skip — **required inside transactions** |

### Key schema

```
{prefix}:v2:repo:{model}:e:{id}:{method}:{selectHash}
{prefix}:v2:repo:{model}:q:{method}:{queryHash}
{prefix}:v2:repo:{model}:e:{id}:__idx
{prefix}:v2:repo:{model}:e:__idx
{prefix}:v2:repo:{model}:q:__idx
{prefix}:v2:repo:{model}:t:{tag}:__idx
```

Redis payloads use tagged JSON for `Date`, `BigInt`, `Bytes`, and `Decimal`. Pass `decimalFactory: (s) => new Prisma.Decimal(s)` on `RedisCacheAdapter` (and/or Nest `PrismaKitModule.forRoot`) so compose clone and cache hits return native Prisma scalars — `JSON.stringify` otherwise turns `Date`/`Decimal` into strings via `toJSON`.

### Debug

```bash
CACHE_DEBUG=true
```

Hits/misses/bypasses via `cacheDebugStorage` from `@prismakit/core`.

### Stampede (`StampedeOptions`)

| Field | Default |
|-------|---------|
| `lockTtl` | `5` (seconds) |
| `retryMs` | `100` |
| `maxRetries` | `10` |
| `backoff` | `'exponential'` (`'fixed'` also valid) |
| `totalTimeoutMs` | `3000` |

### Adapters

**Redis** (`@prismakit/redis`):

```typescript
new RedisCacheAdapter({
  url: process.env.REDIS_URL, // or host + port
  host: 'localhost',          // default when url omitted
  port: 6379,
  prefix: 'myapp',            // default 'prismakit'
  compression: 'gzip',        // 'none' | 'gzip'
  compressionThresholdBytes: 1024,
  decimalFactory: (s) => new Prisma.Decimal(s),
});
```

**Memory** (`@prismakit/memory`) — tests/local:

```typescript
new MemoryCacheAdapter({ prefix: 'test', maxSize: 1000, defaultTtl: 300 });
```

Custom: implement `CacheAdapter`. Prefer fail-open `safe*` semantics.

## Auto-compose

`splitSelect` keeps scalars (+ FK fields from meta) for the Prisma query. Relation keys load via the target repository. Target PK is always injected into the nested select.

Load meta once at bootstrap:

```typescript
import { loadPrismaMetaFromDmmf, loadPrismaMetaFromSchema } from '@prismakit/core';

loadPrismaMetaFromDmmf(Prisma.dmmf);                 // Prisma 5/6
loadPrismaMetaFromSchema('prisma/schema.prisma');    // Prisma 7 (no Prisma.dmmf)
```

Validate: `npx prismakit validate --auto-register` or `assertSelectComposeValid`.

### `ComposeOptions` (global via `setComposeOptions`)

| Field | Default | Notes |
|-------|---------|-------|
| `maxDepth` | `10` | Max relation nesting. |
| `parallel` | `true` | Same-level relations via `Promise.all`. |
| `setCache` | `true` | Nested fetches pass `setCache: true` unless parent has `tx` / `setCache: false`. |

Related repos must be registered on `RepositoryRegistry`.

## Row locks

`SELECT … FOR UPDATE` (and related). Repo `lock` config required. `tx` required on the call.

### Per-call `RowLockOptions`

| Field | Notes |
|-------|-------|
| `mode` | `'update' \| 'noKeyUpdate' \| 'share' \| 'keyShare'`. Default `noKeyUpdate`. |
| `nowait` | Fail immediately if locked. |
| `skipLocked` | Skip locked rows. **Cannot** combine with `nowait`. |

`lock: true` resolves via Prisma meta. Explicit: `{ tableName, columns? }`.

## Telemetry

```typescript
import { setTelemetry } from '@prismakit/core';

setTelemetry({
  enabled: true,
  onEvent: (event) => { /* metrics */ },
  slowThreshold: 500, // emits query.slow for queries ≥ this ms
});
```

| Type | When |
|------|------|
| `cache.hit` / `cache.miss` / `cache.bypass` / `cache.invalidate` / `cache.error` | Cache-aside path |
| `compose.start` / `compose.complete` | Auto-compose (`queryCount`, `durationMs`) |
| `lock.acquired` / `lock.waited` / `lock.timeout` | Row locks |
| `stampede.locked` / `stampede.waited` / `stampede.fallthrough` | Stampede protection |
| `query.complete` / `query.slow` | Repository method timing |

## CLI

```bash
npx prismakit generate <name> [--cache] [--full] [--route <path>] [--prisma-import <path>] [--dry-run]
npx prismakit validate [--schema <path>] [--auto-register] [--no-assert]
npx prismakit help
```

## ESLint

```js
import prismakit from '@prismakit/eslint-plugin';
export default [prismakit.configs.recommended];
```

| Rule | Forbids |
|------|---------|
| `prismakit/no-prisma-service-outside-repos` | Inject/reference `PrismaService` / `PrismaClient` outside allowlist |
| `prismakit/no-direct-prisma-delegate` | `prisma.<model>.*` outside allowlist |
| `prismakit/require-transaction-service` | `.$transaction` in feature code |
| `prismakit/require-cached-repo-provider` | Cached repo class missing from Nest `providers` |

Allowed path patterns: `**/repositories/**`, `**/infrastructure/prisma/**`.

## Bootstrap (plain Node)

```typescript
import { PrismaClient } from '@prisma/client';
import {
  createRepository,
  loadPrismaMetaFromSchema,
  setComposeOptions,
  setTelemetry,
  RepositoryRegistry,
  AutoComposer,
} from '@prismakit/core';
import { RedisCacheAdapter } from '@prismakit/redis';

const prisma = new PrismaClient();
loadPrismaMetaFromSchema('prisma/schema.prisma');
setComposeOptions({ maxDepth: 6, parallel: true, setCache: true });
setTelemetry({ enabled: true, onEvent: (e) => console.debug('[pk]', e.type) });

const cache = new RedisCacheAdapter({ prefix: 'myapp' });
const registry = new RepositoryRegistry();
const autoCompose = new AutoComposer(registry);

const UserRepo = createRepository({
  model: 'user',
  cache: { ttl: 86_400 },
});
const users = new UserRepo({ prisma, cache, registry, autoCompose });
registry.register('user', users);
```

Nest apps should use `PrismaKitModule` instead of wiring this by hand.
