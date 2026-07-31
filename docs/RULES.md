# PrismaKit — Non-negotiable rules

These rules mirror the data-access contract from production NestJS apps using PrismaKit.  
**Violations are bugs.** Enforce with `@prismakit/eslint-plugin` + this doc.

## Forbidden

| Forbidden | Why |
|-----------|-----|
| `PrismaService` / `PrismaClient` in services, helpers, controllers, processors | Bypasses cache, compose, invalidation |
| `prisma.<model>.*` outside `**/repositories/**` | Same |
| `$transaction` / raw `execTx` on Prisma client in feature code | Use `TransactionService` |
| `setCache: true` on auth / uniqueness `getFirst` | Stale nulls / race hazards |
| Caching selects with `password` (or other `sensitiveFields`) | Security |
| Row `lock` without `tx` | Lock must live inside a transaction |

## Required

| Required | How |
|----------|-----|
| Reads/writes | `*Repository` from `createRepository` / `createInjectableRepository` |
| Transactions | `TransactionService.execTx(fn, afterCommit?)` |
| Tx writes | `invalidate: 'none'` then `invalidateCache` in `afterCommit` |
| User-facing reads | `setCache: true` when repo has cache config |
| Relations in select | `model` + `scalarFields` on source repo (auto-compose) |
| ESLint | `plugin:prismakit/recommended` (or flat `configs.recommended`) |

## Layers

```
Controller → Service (handle* only) → Repository → Prisma / Cache
```

Helpers may inject repositories — **never** Prisma client.

## Cache summary

See [CACHE.md](CACHE.md).
