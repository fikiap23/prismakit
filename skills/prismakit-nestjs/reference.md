# PrismaKit NestJS reference

API surface for `@prismakit/nestjs` 3.x. Repository methods, cache, compose, and locks are documented in skill `prismakit` (`reference.md` in that skill). This file covers the Nest adapter only.

## `PrismaKitModuleOptions`

| Option | Required | Description |
|--------|----------|-------------|
| `prisma` | yes | `PrismaClient` (or compatible). Provided as `PRISMAKIT_PRISMA` for repositories only. |
| `cache` | no | `CacheAdapter` (`RedisCacheAdapter` / `MemoryCacheAdapter`). |
| `dmmf` | no | `Prisma.dmmf` on Prisma 5/6. Skip on Prisma 7 — use `schemaPath`. |
| `schemaPath` | no | Load meta from `schema.prisma` when `dmmf` is omitted (compose + locks). Defaults to `prisma/schema.prisma`. |
| `validateCompose` | no | When `true`, `assertSelectComposeValid` on module init. |
| `cacheModels` | no | Strict allowlist of model keys with `cache` config. Omit = fail-open. |
| `compose` | no | `ComposeOptions`: `maxDepth` (default 10), `parallel` (default true), `setCache` (default true). `tx` is per-call only. |
| `telemetry` | no | `{ enabled?: boolean; onEvent?: (event) => void }`. |
| `queryLog` | no | `{ slowThreshold?: number; onSlowQuery?: (e) => void }`. Default threshold 500ms. Setting this enables telemetry. |
| `autoRegisterModels` | no | `true` = stub repos for all schema/DMMF models; `string[]` = those client keys only. |

`queryLog.onSlowQuery` receives `{ model?, method?, durationMs, thresholdMs }` for `query.complete` events at/above the threshold.

## Async config

```typescript
export type PrismaKitModuleAsyncOptions = {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  useFactory: (...args: unknown[]) => Promise<PrismaKitModuleOptions> | PrismaKitModuleOptions;
  inject?: unknown[];
};
```

```typescript
PrismaKitModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    prisma: prismaClient,
    cache: new RedisCacheAdapter({
      url: config.get('REDIS_URL'),
      prefix: config.get('CACHE_PREFIX') ?? 'myapp',
    }),
    cacheModels: ['user', 'product'],
    schemaPath: 'prisma/schema.prisma',
  }),
});
```

## DI tokens

| Token | Type | Allowed injectors |
|-------|------|-------------------|
| `PRISMAKIT_PRISMA` | `PrismaClientLike` | Injectable repositories / kit internals only |
| `PRISMAKIT_CACHE` | `CacheAdapter` | Repositories / kit internals |
| `PRISMAKIT_OPTIONS` | `PrismaKitModuleOptions` | Kit internals |

`TransactionService`, `RepositoryRegistry`, and `AutoComposer` are Nest providers from `PrismaKitModule`.

## `TransactionService`

```typescript
execTx<T, TClient = unknown>(
  fn: (tx: TClient) => Promise<T>,
  afterCommit?: () => Promise<void>,
  options?: TransactionOptions,
): Promise<T>
```

`TransactionOptions`: `{ maxWait?: number; timeout?: number; isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable' | string }`.

Type the client when useful:

```typescript
await this.tx.execTx<User, Prisma.TransactionClient>(async (tx) => { /* ... */ });
```

`afterCommit` runs only after `prisma.$transaction` resolves successfully.

## Repository factories

| Factory | When |
|---------|------|
| `createDefineRepo<Prisma.TypeMap>()` then local `defineRepo({ model, ... })` | **Default** for apps. Zero phantoms; `model` + `scalarFields` + `cache` / `lock`. |
| `defineInjectableRepository({ model, select, create, update, where, orderBy, payload, ... })` | TypeMap unavailable. Package aliases: `defineRepository`. |
| `createInjectableRepository({ model, ... })` | Thin / untyped. Results `unknown` unless `toPayload` is supplied. Alias: `createPrismaRepository`. |

`createDefineRepo` runtime options: `model`, `scalarFields?`, `primaryKey?`, `cache?`, `lock?`, `schemaPath?`.

When `cache` is set, the returned API includes `setCache` / `cacheTags` / `invalidate` / `tags` / `invalidateCache`. Otherwise those fields are omitted from the type (`HasCacheFromOptions`).

`createDefineRepo` / `RepositoryApiFromTypeMap` includes the full runtime surface: `createMany`, `updateMany`, `upsert`, `deleteMany`, `lock` + `orderBy` on `getFirst`, `lock` on `getMany`, and composite-PK `id` on `*ById`. Derive the instance type from the constructor — do not restate model/cache as a second generic:

Export the instance type:

```typescript
export type UserRepository = InstanceType<typeof UserRepository>;
```

## `defineInjectableRepository` shape (escape hatch)

```typescript
import { Prisma } from '@prisma/client';
import { defineInjectableRepository } from '@prismakit/nestjs';

type Of<S> = S extends Prisma.UserSelect
  ? Prisma.UserGetPayload<{ select: S }>
  : never;

export const UserRepository = defineInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  select: null! as Prisma.UserSelect,
  create: null! as Prisma.UserCreateInput,
  update: null! as Prisma.UserUpdateInput,
  where: null! as Prisma.UserWhereInput,
  orderBy: null! as Prisma.UserOrderByWithRelationInput,
  payload: class {
    declare readonly _select: unknown;
    declare type: () => Of<this['_select']>;
  },
  cache: { ttl: 86_400, sensitiveFields: ['password'] },
  lock: true,
});
```

## Re-exports from core

`@prismakit/nestjs` re-exports: `AutoComposer`, `RepositoryRegistry`, `CacheAdapter`, repository option/instance types, `RepoPayloadHKT`, `ComposeOptions`, `TelemetryOptions`, `TelemetryEvent`, `loadPrismaMetaFromDmmf`, `loadPrismaMetaFromSchema`, `setComposeOptions`, `setTelemetry`.

Prefer importing Nest-only APIs from `@prismakit/nestjs` and core-only helpers from `@prismakit/core`.

## Layout

```
src/
  app.module.ts                          # PrismaKitModule.forRootAsync
  infrastructure/prisma/
    define-repo.ts                       # createDefineRepo<Prisma.TypeMap>()
    prisma.service.ts                    # client construction only
  modules/<feature>/
    <feature>.module.ts                  # providers: [Service, XRepository]
    <feature>.service.ts                 # inject repos + TransactionService
    <feature>.controller.ts              # HTTP only
    repositories/<feature>.repository.ts
```

Prisma client usage is allowed under `**/repositories/**` and `**/infrastructure/prisma/**` only.
