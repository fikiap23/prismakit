# PrismaKit review checklist

Copy this list and tick every item before marking a data-access change done. Failures are bugs.

```
Task Progress:
- [ ] Layering
- [ ] Repository factory
- [ ] Selects
- [ ] Cache
- [ ] Transactions
- [ ] Locks
- [ ] Compose
- [ ] ESLint / layout
```

## Layering

- [ ] No `PrismaClient` / `PrismaService` injected in services, helpers, controllers, processors, or queue workers
- [ ] No `prisma.<model>.*` outside `**/repositories/**`
- [ ] Controllers/route handlers call services only — not repositories (unless the app already uses a documented exception)
- [ ] Helpers inject repositories, never the Prisma client

## Repository factory

- [ ] New model access goes through `createRepository` (core) or the app's Nest `defineRepo` binder — not a one-off Prisma call
- [ ] File lives under `**/repositories/**` as `*.repository.ts`
- [ ] `model` is the Prisma client key (`'user'`, not `'User'`)
- [ ] `scalarFields` is set **or** Prisma meta is loaded at bootstrap (`dmmf` / `schemaPath`)
- [ ] `cacheModels` is omitted unless the app wants an extra allowlist

## Selects

- [ ] Every read/write that returns a row passes an explicit `select`
- [ ] Select presets used: `minimal` (no cache), `general` (API, cacheable), `withPassword` (auth, never cached)
- [ ] Controllers do not construct `select` objects
- [ ] Sensitive fields (`password`, tokens) only appear in auth presets

## Cache

- [ ] User-facing `getById` / `getThrowById` / `getMany` / `getManyPaginate` pass `setCache: true` when the repo has `cache` (unless `defaultSetCache: true`)
- [ ] Auth / uniqueness / JWT `getFirst` does **not** pass `setCache: true`
- [ ] No `setCache` on selects that include `sensitiveFields`
- [ ] `setCache` / `invalidateCache` not passed on repos that omit `cache` config (types omit those fields)
- [ ] Query lists that must drop together use `cacheTags` on read and `tags` on write

## Transactions

- [ ] Multi-step writes share one transaction; `tx` is passed into **every** repo call in that unit of work
- [ ] Nest feature code uses `TransactionService.execTx`, not `prisma.$transaction`
- [ ] Writes inside tx use `invalidate: 'none'`
- [ ] `invalidateCache` runs after commit (`afterCommit` in Nest, or immediately after `$transaction` in plain Node)
- [ ] No cached reads mixed with half-committed writes

## Locks

- [ ] Repo declares `lock` (`true`, client key, table name, or config) before any call passes `lock`
- [ ] Every `lock: { mode }` call also passes `tx`
- [ ] `skipLocked` is not combined with `nowait`
- [ ] Locked transactions stay short

## Compose

- [ ] Relations are nested objects in `select`, not Prisma `include`
- [ ] Related model repositories are registered (or `autoRegisterModels` covers them)
- [ ] `npx prismakit validate` (or `validateCompose: true`) is clean when selects nest relations

## ESLint / layout

- [ ] `@prismakit/eslint-plugin` `recommended` is in the app ESLint config
- [ ] Lint passes on the changed files
- [ ] Prisma client construction stays under `**/infrastructure/prisma/**` (or equivalent allowlisted folder)
