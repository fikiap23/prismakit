# @prismakit/core

Framework-agnostic Prisma repository factory with **cache-aside**, **auto-compose**, and **row locks**.

Not a Prisma fork — wrap your existing `PrismaClient`.

[Documentation](https://github.com/fikiap23/prismakit/blob/master/docs/README.md) · [Getting started](https://github.com/fikiap23/prismakit/blob/master/docs/getting-started.md) · [GitHub](https://github.com/fikiap23/prismakit)

## Install

```bash
pnpm add @prismakit/core
# peer: @prisma/client
```

## Quick start

```typescript
import { createRepository } from '@prismakit/core';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const UserRepository = createRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum, // for auto-compose
  cache: { ttl: 86400 },                    // or `cache: true`
  lock: 'users',                            // DB table name (@@map)
});

const users = new UserRepository({ prisma /*, cache */ });

const user = await users.getThrowById({
  id,
  select: { id: true, email: true, name: true },
  setCache: true,
});
```

`getDelegate` and `toPayload` default from `model` — no boilerplate.

## Repository options

| Option | Description |
|--------|-------------|
| `model` | Prisma client key (`'user'` → `prisma.user`) |
| `scalarFields` | Usually `Prisma.XScalarFieldEnum` — enables auto-compose |
| `cache` | `CacheOptions` or `true` for defaults |
| `lock` | Lock config or table name string |
| `getDelegate` / `toPayload` | Optional overrides |

## Main methods

| Method | Purpose |
|--------|---------|
| `getById` / `getThrowById` | Read by id (`setCache?`, `lock?`, `tx?`) |
| `getFirst` / `getMany` / `getManyPaginate` | Queries |
| `getManyCursor` | Cursor pagination (`CursorPage<T>`) |
| `count` / `exists` | `{ count }` / `{ exists }` |
| `aggregate` / `groupBy` | Prisma aggregate delegates |
| `create` / `updateById` / `deleteById` | Writes by id (`invalidate`, optional `tags`) |
| `updateMany` / `deleteMany` | Bulk writes by `where` |
| `invalidateCache` | Manual cache clear |

Cache runs **only** when you pass `setCache: true` and the repo has `cache` config. Never cache auth / uniqueness lookups.

## NestJS

Prefer [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs) for DI:

- `PrismaKitModule`
- `createInjectableRepository`
- `TransactionService`

## Related packages

| Package | Role |
|---------|------|
| [`@prismakit/redis`](https://www.npmjs.com/package/@prismakit/redis) | Redis `CacheAdapter` |
| [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs) | NestJS integration |
| [`@prismakit/cli`](https://www.npmjs.com/package/@prismakit/cli) | Scaffold / validate / skills |
| [`@prismakit/eslint-plugin`](https://www.npmjs.com/package/@prismakit/eslint-plugin) | Repository-only ESLint rules |

## Docs

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [Repository guide](https://github.com/fikiap23/prismakit/blob/master/docs/guide/repository.md)
- [Cache](https://github.com/fikiap23/prismakit/blob/master/docs/guide/cache.md)
- [Auto-compose](https://github.com/fikiap23/prismakit/blob/master/docs/guide/auto-compose.md)
- [Locks](https://github.com/fikiap23/prismakit/blob/master/docs/guide/locks.md)
- [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)

## License

Apache-2.0
