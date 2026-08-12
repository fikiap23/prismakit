# Repository guide

Everything that touches Prisma goes through a repository created with `createRepository` (core) or `createInjectableRepository` (NestJS).

## Creating a repository (strong types)

Use `defineInjectableRepository` (alias `defineRepo`) — phantoms + payload HKT:

```typescript
import { Prisma } from '@prisma/client';
import { defineInjectableRepository } from '@prismakit/nestjs';

type Of<S> = S extends Prisma.UserSelect
  ? Prisma.UserGetPayload<{ select: S }>
  : never;

export const UserRepository = defineInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  select: null! as Prisma.UserSelect,
  create: null! as Prisma.UserCreateInput,
  update: null! as Prisma.UserUpdateInput,
  where: null! as Prisma.UserWhereInput,
  orderBy: null! as Prisma.UserOrderByWithRelationInput,
  payload: class {
    declare readonly _select: unknown;
    declare type: () => Of<this['_select']>;
  },
  cache: { ttl: 86400, sensitiveFields: ['password'] },
  lock: 'users',
});

export interface UserRepository extends InstanceType<typeof UserRepository> {}
```

`getById({ select: { id: true, email: true } })` then returns
`Prisma.UserGetPayload<{ select: { id: true; email: true } }> | null`.

### Types-bag overload (equivalent)

You can still use `createInjectableRepository<UserTypes>({...})` with an
explicit `RepoTypesDefinition` if you prefer that style.

### Minimal (no payload precision)

Omitting the types bag keeps the factory thin, but method results are `unknown`
unless you supply a typed `toPayload`. Prefer `defineInjectableRepository` above for app code.

```typescript
export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
  lock: 'users',
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `model` | `string` | Prisma client key (`prisma.user` → `'user'`). Needed for cache + auto-compose. |
| `scalarFields` | `Record<string, string>` | Usually `Prisma.XScalarFieldEnum`. Enables select split + compose. |
| `cache` | `CacheOptions \| true` | Enable cache-aside. `true` → `{ ttl: 86400, sensitiveFields: ['password'] }`. |
| `lock` | `RepositoryLockConfig \| string` | Row lock config, or DB table name (`@@map`) resolved from schema. |
| `schemaPath` | `string` | Path to `schema.prisma` (lock validation / schema helpers). |
| `getDelegate` | `(client) => delegate` | Optional. Defaults to `(c) => c[model]`. |
| `toPayload` | `(data) => payload` | Optional. Defaults to identity cast (use types bag instead). |

### Shorthands

```typescript
cache: true,        // default TTL + sensitiveFields
lock: 'users',      // same as buildLockConfigFromSchema('users')
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

With `model` + `scalarFields`, relation keys in `select` are loaded via other registered repositories (not Prisma `include`).

See [Auto-compose](auto-compose.md).

## Core vs Nest

| | Core | NestJS |
|---|------|--------|
| Factory | `createRepository` | `createInjectableRepository` |
| Instantiation | `new Repo({ prisma, cache })` | Nest DI (register class in `providers`) |
| Transactions | Your own `$transaction` | `TransactionService.execTx` |
