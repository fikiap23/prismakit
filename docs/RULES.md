# PrismaKit — Non-negotiable rules

These rules are the data-access contract for PrismaKit apps.  
**Violations are bugs.** Enforce with [`@prismakit/eslint-plugin`](reference/eslint.md) + this doc.

## Forbidden

| Forbidden | Why |
|-----------|-----|
| `PrismaService` / `PrismaClient` in services, helpers, controllers, processors | Bypasses cache, compose, invalidation |
| `prisma.<model>.*` outside `**/repositories/**` | Same |
| `$transaction` on Prisma client in feature code | Use `TransactionService` ([guide](guide/transactions.md)) |
| `setCache: true` on auth / uniqueness `getFirst` | Stale nulls / race hazards |
| Caching selects with `password` (or other `sensitiveFields`) | Security |
| Row `lock` without `tx` | Lock must live inside a transaction |

## Required

| Required | How |
|----------|-----|
| Reads/writes | `*Repository` from `createRepository` / Nest `createDefineRepo` (`defineAppRepo`) |
| Transactions (Nest) | `TransactionService.execTx(fn, afterCommit?)` |
| Tx writes | `invalidate: 'none'` then `invalidateCache` in `afterCommit` |
| User-facing reads | `setCache: true` when repo has cache config |
| Relations in select | `model` on source repo; load meta (`schemaPath` / `dmmf`) — [auto-compose](guide/auto-compose.md) |
| Cached repository classes | Nest `providers` of a feature module. Missing provider → boot fail (`strictCachedRepos`) and ESLint `require-cached-repo-provider`. `autoRegisterModels` stubs are uncached. |
| ESLint | `prismakit.configs.recommended` |

## Layers

```
Controller → Service (orchestration) → Repository → Prisma / Cache
```

Helpers may inject repositories — **never** Prisma client.

## Learn more

- [Getting started](getting-started.md)
- [Upgrade to 4.0](guide/migration-to-4.md)
- [Cache](guide/cache.md)
- [Transactions](guide/transactions.md)
- [ESLint](reference/eslint.md)
