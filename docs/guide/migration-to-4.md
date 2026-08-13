# Upgrade to PrismaKit 4.0

Notes for apps on **3.2.x** moving to **4.0**. Bump all `@prismakit/*` packages together. The public API is **pre-stable** — expect further cleanup before a long-term 4.x freeze.

## Breaking changes

| Removed / changed | Use instead |
|-------------------|-------------|
| `defineRepository` (core) | `createRepository` |
| `createPrismaRepository` (core / Nest) | Core: `createRepository`. Nest: `createDefineRepo` / `createInjectableRepository` |
| `defineInjectableRepository` / `defineRepo` / `defineRepository` (Nest) | `createDefineRepo` → app `defineAppRepo` (default). Escape hatch: `createInjectableRepository` |
| Repo options `scalarFields`, `primaryKey`, `schemaPath`, `getDelegate` | Load meta via `loadPrismaMetaFromSchema` / `loadPrismaMetaFromDmmf`, or Nest `schemaPath` / `dmmf`. PK and scalars come from meta. |
| Nest `cacheModels` | Removed. Repository `cache` is the only allowlist. |
| Nest `queryLog` | Fold into `telemetry` (`slowThreshold`, `onSlowQuery`, `onEvent`) |
| `lock: 'users'` / client-key string | `lock: true` (meta) or `{ tableName, columns? }` |
| `invalidate: 'stale'` | `'all'` / `'entity'` / `'queries'` / `'none'` |
| `redisJsonReviver` export | `createRedisJsonReviver(options?)` from `@prismakit/redis` |
| `IPaginatedResult` / `RepositoryCacheOptions` | `PaginatedResult` / `CacheOptions` |
| Phantom TypeMap bags on Nest repos | Prefer `createDefineRepo<Prisma.TypeMap>()` |

## Migration snippets

### Nest factory

```typescript
// Before (3.x)
export const UserRepository = defineInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  select: null! as Prisma.UserSelect,
  // …phantoms…
  cache: { ttl: 86400 },
  lock: 'users',
});

// After (4.0)
export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
  cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
});

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { sensitiveFields: ['password'] },
  lock: true,
}) {}
```

### Nest module — `queryLog` → `telemetry`

```typescript
// Before
PrismaKitModule.forRoot({
  prisma,
  cache,
  cacheModels: ['user'],
  queryLog: {
    slowThreshold: 500,
    onSlowQuery: (e) => logger.warn(e),
  },
});

// After
PrismaKitModule.forRoot({
  prisma,
  cache,
  schemaPath: 'prisma/schema.prisma', // or dmmf: Prisma.dmmf
  telemetry: {
    enabled: true,
    slowThreshold: 500,
    onSlowQuery: (e) => logger.warn(e),
    onEvent: (e) => metrics.record(e),
  },
});
```

### Core repository

```typescript
// Before
const UserRepo = createRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  primaryKey: 'id',
  schemaPath: 'prisma/schema.prisma',
  lock: 'users',
  cache: { ttl: 86400 },
});

// After
import { createRepository, loadPrismaMetaFromSchema } from '@prismakit/core';

loadPrismaMetaFromSchema('prisma/schema.prisma');
// Prisma 5/6: loadPrismaMetaFromDmmf(Prisma.dmmf)

const UserRepo = createRepository({
  model: 'user',
  cache: { ttl: 86400 },
  lock: true,
});
```

### Redis JSON reviver

```typescript
// Before
import { redisJsonReviver } from '@prismakit/redis';

// After
import { createRedisJsonReviver } from '@prismakit/redis';

const reviver = createRedisJsonReviver({ /* DecimalFactory? */ });
```

Cache debug helpers (`cacheDebugStorage`, `isCacheDebugEnabled`, `recordCacheDebug`) remain on `@prismakit/core`.

## Checklist

1. Bump all `@prismakit/*` to `^4.0.0`.
2. Replace Nest aliases with `createDefineRepo` / `defineAppRepo`.
3. Delete `scalarFields` / `primaryKey` / `schemaPath` / `getDelegate` from repo options; load meta at bootstrap.
4. Change `lock: '…'` strings to `lock: true` (or explicit `{ tableName, columns }`).
5. Move `queryLog` fields into `telemetry`; remove `cacheModels`.
6. Replace `redisJsonReviver` with `createRedisJsonReviver`.
7. Grep for removed names; run `npx prismakit validate --auto-register` and your test suite.

See also: [Upgrade to 3.2](./migration-to-3.2.md) · [NestJS](./nestjs.md) · [Repository](./repository.md) · [Telemetry](./telemetry.md)
