# Repository guide

Everything that touches Prisma goes through a repository created with `createRepository` (core) or `createInjectableRepository` (NestJS).

## Creating a repository (strong types)

Pass a **types bag** so select→payload stays precise without a runtime `toPayload`:

```typescript
import { Prisma } from '@prisma/client';
import {
  createInjectableRepository,
  type RepoPayloadHKT,
} from '@prismakit/nestjs';

type UserPayloadOf<S> = S extends Prisma.UserSelect
  ? Prisma.UserGetPayload<{ select: S }>
  : never;

interface UserPayloadHKT extends RepoPayloadHKT {
  type(): UserPayloadOf<this['_select']>;
}

type UserTypes = {
  select: Prisma.UserSelect;
  create: Prisma.UserCreateInput;
  update: Prisma.UserUpdateInput;
  where: Prisma.UserWhereInput;
  orderBy: Prisma.UserOrderByWithRelationInput;
  payload: UserPayloadHKT;
};

export const UserRepository = createInjectableRepository<UserTypes>({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400, sensitiveFields: ['password'] },
  lock: 'users',
});

export type UserRepository = InstanceType<typeof UserRepository>;
```

`getById({ select: { id: true, email: true } })` then returns
`Prisma.UserGetPayload<{ select: { id: true; email: true } }> | null`.

### Minimal (no payload precision)

Omitting the types bag keeps the factory thin, but method results are `unknown`
unless you supply a typed `toPayload`. Prefer the types bag above for app code.

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
