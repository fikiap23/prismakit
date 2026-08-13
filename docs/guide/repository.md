# Repository guide

Everything that touches Prisma goes through a repository created with `createRepository` (core) or Nest `createDefineRepo` / `defineAppRepo`.

## NestJS (default)

```typescript
import { createDefineRepo } from '@prismakit/nestjs';
import type { Prisma } from '@prisma/client';

export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
  cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
});

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { sensitiveFields: ['password'] },
  lock: true,
}) {}

export interface UserRepository extends InstanceType<typeof UserRepository> {}
```

`getById({ select: { id: true, email: true } })` then returns a typed payload from the TypeMap.

### Escape hatch

`createInjectableRepository({ model, cache?, lock?, toPayload? })` wraps `createRepository` for Nest DI when TypeMap binding is unavailable. Results are thinly typed unless you supply `toPayload`. Prefer `createDefineRepo` for app code.

## Core (plain Node)

```typescript
import { createRepository, loadPrismaMetaFromSchema } from '@prismakit/core';

loadPrismaMetaFromSchema('prisma/schema.prisma');

export const UserRepoClass = createRepository({
  model: 'user',
  cache: { ttl: 86400 },
  lock: true,
});

const users = new UserRepoClass({ prisma, cache });
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `model` | `string` | Prisma client key (`prisma.user` → `'user'`). **Required.** |
| `cache` | `CacheOptions \| true` | Enable cache-aside. `true` → `{ ttl: 86400, sensitiveFields: ['password'] }`. |
| `lock` | `true \| RepositoryLockConfig` | `true` resolves table/columns from Prisma meta, or `{ tableName, columns? }`. |
| `toPayload` | `(data) => payload` | Optional. Defaults to identity. |

Scalars, primary key, and relations come from Prisma meta (`loadPrismaMetaFromSchema` / `loadPrismaMetaFromDmmf`, or Nest `schemaPath` / `dmmf`).

### Shorthands

```typescript
cache: true,  // default TTL + sensitiveFields
lock: true,   // table + columns from meta
```

## Reading

All read methods accept `select`, optional `tx`, and optional `setCache`.

### `getById` / `getThrowById`

```typescript
await repo.getById({
  id,
  select: { id: true, email: true },
  setCache: true,
});

await repo.getThrowById({ id, select: { id: true } }); // throws if missing
```

### `getFirst`

```typescript
await repo.getFirst({
  where: { email },
  select: { id: true },
  // Do NOT setCache on auth / uniqueness checks
});
```

### `getMany`

```typescript
await repo.getMany({
  where: { status: 'ACTIVE' },
  select: { id: true, name: true },
  orderBy: { createdAt: 'desc' },
  setCache: true,
  cacheTags: ['users:active'], // optional tag index
});
```

### `getManyPaginate`

```typescript
const page = await repo.getManyPaginate({
  where: {},
  select: { id: true, name: true },
  page: 1,
  pageSize: 20,
  setCache: true,
});
// { data, meta: { page, pageSize, totalItems, totalPages } }
```

### `getManyCursor`

Keyset pagination for large lists:

```typescript
const page = await repo.getManyCursor({
  where: { status: 'ACTIVE' },
  select: { id: true, name: true },
  orderBy: { id: 'asc' },
  cursor: lastId ? { id: lastId } : undefined,
  take: 20,
  setCache: true,
});
// { data, nextCursor, hasMore }
```

When `cursor` is set, PrismaKit defaults **`skip: 1`** (Prisma cursors are inclusive). Pass `skip: 0` only if you want the cursor row repeated.

### Composite primary keys

For `@@id([postId, tagId])`, pass `id` as an object. PrismaKit maps it to Prisma’s compound unique input (`postId_tagId: { postId, tagId }`):

```typescript
await postTags.getById({
  id: { postId, tagId },
  select: { postId: true, tagId: true },
  setCache: true,
});
```

### `count` / `exists`

```typescript
await repo.count({ where: { status: 'ACTIVE' }, setCache: true });
await repo.exists({ where: { email } }); // no setCache on uniqueness
```

See [Aggregations](aggregations.md) for `aggregate` / `groupBy`.

### When to use `setCache: true`

| Use case | `setCache` |
|----------|------------|
| User-facing detail / list | `true` |
| Auth, uniqueness, JWT lookup | omit / `false` |
| Inside a transaction (`tx`) | ignored (always skip) |

## Writing

Mutation `tags` are optional (default: no tag invalidation).

### `create`

```typescript
await repo.create({
  data: { email, name },
  select: { id: true },
  invalidate: 'queries', // default
});
```

### `updateById` / `deleteById`

```typescript
await repo.updateById({
  id,
  data: { name: 'Ada' },
  select: { id: true, name: true },
  invalidate: 'all', // default
});

await repo.deleteById({ id, invalidate: 'all' });
```

### `updateMany` / `deleteMany`

Bulk mutations by `where` (default `invalidate: 'all'`):

```typescript
await repo.updateMany({
  where: { status: 'DRAFT' },
  data: { status: 'ARCHIVED' },
});

await repo.deleteMany({ where: { expiredAt: { lt: now } } });
```

### Invalidate modes

| Mode | Effect |
|------|--------|
| `all` | Entity keys + query index |
| `entity` | Entity keys only |
| `queries` | Query index only |
| `none` | Skip (use inside transactions) |

### Manual invalidation

```typescript
await repo.invalidateCache({ id, tags: ['users:active'] });
```

## Transactions

Pass `tx` into repository methods. Do not invalidate cache inside the transaction — use `invalidate: 'none'`, then `invalidateCache` after commit.

See [Transactions](transactions.md).

## Row locks

```typescript
await this.tx.execTx(async (tx) => {
  const row = await repo.getById({
    tx,
    id,
    select: { id: true, balance: true },
    lock: { mode: 'update' }, // requires repo.lock config
  });
  // ...
});
```

See [Locks](locks.md).

## Auto-compose

With `model` and Prisma meta loaded, relation keys in `select` are loaded via other registered repositories (not Prisma `include`).

See [Auto-compose](auto-compose.md).

## Core vs Nest

| | Core | NestJS |
|---|------|--------|
| Factory | `createRepository` | `createDefineRepo` / `defineAppRepo` (default) |
| Instantiation | `new Repo({ prisma, cache })` | Nest DI (register class in `providers`) |
| Transactions | Your own `$transaction` | `TransactionService.execTx` |
| Escape hatch | — | `createInjectableRepository` |
