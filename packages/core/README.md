# @prismakit/core

Framework-agnostic Prisma repository factory with **cache-aside**, **auto-compose**, and **row locks**.

Not a Prisma fork — wrap your existing `PrismaClient`.

**Status:** pre-stable (4.0).

[Documentation](https://github.com/fikiap23/prismakit/blob/master/docs/README.md) · [Getting started](https://github.com/fikiap23/prismakit/blob/master/docs/getting-started.md) · [Migrate to 4.0](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-to-4.md) · [GitHub](https://github.com/fikiap23/prismakit)

## Install

```bash
pnpm add @prismakit/core
# peer: @prisma/client
```

## Quick start

```typescript
import {
  createRepository,
  loadPrismaMetaFromSchema,
} from '@prismakit/core';
import { PrismaClient } from '@prisma/client';

loadPrismaMetaFromSchema('prisma/schema.prisma');
// Prisma 5/6: loadPrismaMetaFromDmmf(Prisma.dmmf)

const prisma = new PrismaClient();

const UserRepository = createRepository({
  model: 'user',
  cache: { ttl: 86400 }, // or `cache: true`
  lock: true,            // table + columns from Prisma meta
});

const users = new UserRepository({ prisma /*, cache */ });

const user = await users.getThrowById({
  id,
  select: { id: true, email: true, name: true },
  setCache: true,
});
```

Only public option: `createRepository`. Meta (scalars, PK, relations) comes from `loadPrismaMetaFromSchema` / `loadPrismaMetaFromDmmf`.

## Repository options

| Option | Description |
|--------|-------------|
| `model` | Prisma client key (`'user'` → `prisma.user`). **Required.** |
| `cache` | `CacheOptions` or `true` for defaults |
| `lock` | `true` (from meta) or `{ tableName, columns? }` |
| `toPayload` | Optional payload mapper (defaults to identity) |

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

Cache runs **only** when you pass `setCache: true` (or `defaultSetCache`) and the repo has `cache` config. Never cache auth / uniqueness lookups.

## NestJS

Prefer [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs):

- `PrismaKitModule`
- `createDefineRepo` / app `defineAppRepo` (default)
- `createInjectableRepository` (low-level escape hatch)
- `TransactionService`

## Related packages

| Package | Role |
|---------|------|
| [`@prismakit/redis`](https://www.npmjs.com/package/@prismakit/redis) | Redis `CacheAdapter` |
| [`@prismakit/memory`](https://www.npmjs.com/package/@prismakit/memory) | In-memory `CacheAdapter` (tests) |
| [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs) | NestJS integration |
| [`@prismakit/opentelemetry`](https://www.npmjs.com/package/@prismakit/opentelemetry) | OpenTelemetry metrics/spans |
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
