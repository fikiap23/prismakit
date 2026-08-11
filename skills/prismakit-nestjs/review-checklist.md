# PrismaKit NestJS review checklist

Copy this list and tick every item before marking a Nest data-access change done. Also complete skill `prismakit` `review-checklist.md` (layering, cache, compose, locks).

```
Task Progress:
- [ ] Core contract (skill prismakit checklist)
- [ ] Module wiring
- [ ] Repository factory
- [ ] DI
- [ ] Transactions
- [ ] Feature shape
```

## Core contract

- [ ] Skill `prismakit` review checklist is complete for this change

## Module wiring

- [ ] `PrismaKitModule.forRoot` or `forRootAsync` is imported once at the app root
- [ ] `prisma` is the shared client instance
- [ ] Prisma meta is loaded: `dmmf: Prisma.dmmf` (Prisma 5/6) or `schemaPath: 'prisma/schema.prisma'` (Prisma 7)
- [ ] Production cache uses `RedisCacheAdapter` with a stable `prefix`
- [ ] `cacheModels` is omitted (repo `cache` is source of truth), or lists every cached model if an allowlist is used
- [ ] `validateCompose: true` is on for apps that nest relations in `select`

## Repository factory

- [ ] App has a single binder: `createDefineRepo<Prisma.TypeMap>()` in `src/infrastructure/prisma/define-repo.ts` (or equivalent)
- [ ] Feature repos call that binder — not `createInjectableRepository` unless types are intentionally thin
- [ ] `export interface XRepository extends InstanceType<typeof XRepository> {}` (infers cache from options; do not use a same-name `type` alias)
- [ ] Repo class is in `providers` and `exports` of the feature module
- [ ] `lock: true` (or table/client key) is set when any call uses `lock`

## DI

- [ ] Services inject `*Repository` and `TransactionService` — never `PRISMAKIT_PRISMA`, `PrismaClient`, or `PrismaService`
- [ ] Controllers inject services — not repositories, not Prisma
- [ ] `PRISMAKIT_PRISMA` appears only inside `**/repositories/**` or kit internals

## Transactions

- [ ] Multi-step writes use `this.tx.execTx(fn, afterCommit)`
- [ ] No `prisma.$transaction` / `.$transaction` in feature code
- [ ] Every repo call inside `fn` receives `tx`
- [ ] Writes use `invalidate: 'none'`
- [ ] Matching `invalidateCache` calls live in `afterCommit`
- [ ] Row locks run only inside `execTx`

## Feature shape

- [ ] HTTP mapping stays in the controller; orchestration in the service; Prisma in the repository
- [ ] Select presets live next to the repository (`minimal` / `general` / `withPassword`)
- [ ] After `prismakit generate --full`, the new `*Module` is imported in `AppModule`
- [ ] After repo-only generate, the class is registered in feature `providers`
- [ ] ESLint `prismakit.configs.recommended` passes
