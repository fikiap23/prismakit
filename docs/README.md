# PrismaKit documentation

PrismaKit is a **repository kit for Prisma** — cache-aside, auto-compose, and row locks — without forking Prisma.

- **Core** works in any Node app
- **NestJS** adapter is optional
- **ESLint** enforces repository-only data access

## Start here

1. [Getting started](getting-started.md) — install and first repository
2. [Architecture & rules](RULES.md) — what you must / must not do
3. [Repository guide](guide/repository.md) — options and methods

## Guides

| Guide | What you learn |
|-------|----------------|
| [Repository](guide/repository.md) | `createRepository` options, reads, writes, pagination |
| [NestJS](guide/nestjs.md) | `PrismaKitModule`, injectable repos, DI tokens |
| [Cache](guide/cache.md) | When to cache, invalidation, Redis, tags, debug |
| [Auto-compose](guide/auto-compose.md) | Relations in `select` without Prisma `include` |
| [Locks](guide/locks.md) | `SELECT … FOR UPDATE` inside transactions |
| [Transactions](guide/transactions.md) | `execTx` + cache invalidation after commit |

## Reference

| Page | Contents |
|------|----------|
| [CLI](reference/cli.md) | `generate`, `codegen`, `validate` |
| [ESLint plugin](reference/eslint.md) | Rules and flat config |
| [AGENTS.md](AGENTS.md) | Short contract for humans and AI agents |

## Packages

| Package | npm |
|---------|-----|
| `@prismakit/core` | [npm](https://www.npmjs.com/package/@prismakit/core) |
| `@prismakit/redis` | [npm](https://www.npmjs.com/package/@prismakit/redis) |
| `@prismakit/nestjs` | [npm](https://www.npmjs.com/package/@prismakit/nestjs) |
| `@prismakit/cli` | [npm](https://www.npmjs.com/package/@prismakit/cli) |
| `@prismakit/eslint-plugin` | [npm](https://www.npmjs.com/package/@prismakit/eslint-plugin) |

## Mental model

```
Controller / route handler
        ↓
Service (orchestration only)
        ↓
Repository  →  CacheAdapter (optional)
        ↓
PrismaClient  →  Database
```

Only **repositories** talk to Prisma. Everything else calls repositories.
