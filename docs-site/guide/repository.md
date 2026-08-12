# Repository

Everything that touches Prisma goes through a repository from `createRepository` (core) or `createInjectableRepository` / `defineInjectableRepository` (NestJS).

## Factory options

| Option | Purpose |
|--------|---------|
| `model` | Prisma client key (`'user'` → `prisma.user`) — required for cache + compose |
| `scalarFields` | Usually `Prisma.XScalarFieldEnum` — select split / compose |
| `cache` | `CacheOptions` or `true` for defaults |
| `lock` | Table name, `true`, or lock config |
| `primaryKey` | Override PK (`string` or composite `string[]`) |

## Common methods

| Method | Prisma equivalent |
|--------|-------------------|
| `getById` / `getThrowById` | `findUnique` / `findUniqueOrThrow` |
| `getFirst` / `getMany` | `findFirst` / `findMany` |
| `getManyPaginate` | paginator over `findMany` |
| `getManyCursor` | cursor / keyset pagination |
| `count` / `exists` | `count` / `count({ take: 1 })` |
| `aggregate` / `groupBy` | `aggregate` / `groupBy` |
| `create` / `createMany` | `create` / `createMany` |
| `updateById` / `updateMany` | `update` / `updateMany` |
| `deleteById` / `deleteMany` | `delete` / `deleteMany` |
| `invalidateCache` | manual post-tx invalidation |

Reads accept `select`, optional `tx`, and optional `setCache`. Writes accept `invalidate` (`'all' \| 'entity' \| 'queries' \| 'none'`).

## Rules

- Only repositories call Prisma delegates.
- Prefer select presets (`general`, `minimal`, `withPassword`) over ad-hoc selects.
- Pass `setCache: true` only on user-facing cacheable reads.

Full guide: [docs/guide/repository.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/repository.md)
