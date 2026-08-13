# PrismaKit NestJS reference

API surface for `@prismakit/nestjs` **4.0** (pre-stable). Repository methods, cache, compose, and locks are documented in skill `prismakit` (`reference.md` in that skill). This file covers the Nest adapter only.

## `PrismaKitModuleOptions`

| Option | Required | Description |
|--------|----------|-------------|
| `prisma` | yes | `PrismaClient` (or compatible). Provided as `PRISMAKIT_PRISMA` for repositories only. |
| `cache` | no | `CacheAdapter` (`RedisCacheAdapter` / `MemoryCacheAdapter`). |
| `dmmf` | no | `Prisma.dmmf` on Prisma 5/6. Skip on Prisma 7 — use `schemaPath`. |
| `schemaPath` | no | Load meta from `schema.prisma` when `dmmf` is omitted (compose + locks). Defaults to `prisma/schema.prisma`. |
| `validateCompose` | no | When `true`, `assertSelectComposeValid` on module init. |
| `strictCachedRepos` | no | Fail boot when a cached repo is missing from `providers`, or listed in two modules. Default `true`. |
| `modulesRoot` | no | Directory scanned by `strictCachedRepos`. Default `src/modules`. |
| `compose` | no | `ComposeOptions`: `maxDepth` (default 10), `parallel` (default true), `setCache` (default true). |
| `telemetry` | no | `{ enabled?, slowThreshold?, onSlowQuery?, onEvent? }`. |
| `autoRegisterModels` | no | `true` = stub repos for all schema/DMMF models; `string[]` = those client keys only. |

`onSlowQuery` receives `{ model?, method?, durationMs, thresholdMs }` for slow queries. Setting `slowThreshold` / `onSlowQuery` enables telemetry unless `enabled: false`.

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
    schemaPath: 'prisma/schema.prisma',
    telemetry: {
      enabled: true,
      slowThreshold: 500,
    },
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

`afterCommit` runs only after `prisma.$transaction` resolves successfully.

## Repository factories

| Factory | When |
|---------|------|
| `createDefineRepo<Prisma.TypeMap>()` then app `defineAppRepo({ model, ... })` | **Default** for apps. Zero phantoms; `model` + `cache` / `lock` / `toPayload`. |
| `createInjectableRepository({ model, ... })` | Low-level escape hatch. Results thinly typed unless `toPayload` is supplied. |

`createDefineRepo` accepts app-wide defaults (`cache`) and per-repo options: `model`, `cache?` (`true` inherits app defaults), `lock?`, `toPayload?`.

When `cache` is set, the returned API includes `setCache` / `cacheTags` / `invalidate` / `tags` / `invalidateCache`. Otherwise those fields are omitted from the type (`HasCacheFromOptions`).

Export the instance type with interface merging so `cache` on options gates `setCache`:

```typescript
export interface UserRepository extends InstanceType<typeof UserRepository> {}
```

## Layout

```
src/
  app.module.ts                          # PrismaKitModule.forRootAsync
  infrastructure/prisma/
    define-app-repo.ts                   # createDefineRepo<Prisma.TypeMap>({ cache defaults })
    prisma.service.ts                    # client construction only
  modules/<feature>/
    <feature>.module.ts                  # providers: [Service, XRepository]
    <feature>.service.ts                 # inject repos + TransactionService
    <feature>.controller.ts              # HTTP only
    repositories/<feature>.repository.ts
```

Prisma client usage is allowed under `**/repositories/**` and `**/infrastructure/prisma/**` only.
