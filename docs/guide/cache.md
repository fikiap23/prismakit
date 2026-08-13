# Cache guide

Cache is **cache-aside** inside the repository. Redis is optional; any `CacheAdapter` works.

Full short summary also lives in the historical [CACHE.md](../CACHE.md) pointer page.

## How it works

```
Service → Repository → CacheAdapter? → Prisma → Database
```

A read uses the cache **only when all of these are true**:

1. You pass `setCache: true` (or repo `cache.defaultSetCache: true` without `setCache: false`)
2. The repository has `model` + `cache` config
3. There is no `tx` (transactions never cache)
4. The method is not disabled in `cache.methods`
5. The `select` does not include a sensitive field

If Redis is down, the Redis adapter **fails open** — queries still hit Prisma.

## Configure cache on a repository

```typescript
defineAppRepo({
  model: 'user',
  cache: {
    ttl: 86400,           // entity TTL (seconds)
    nullTtl: 60,          // negative cache for null results
    sensitiveFields: ['password', 'refreshToken'],
    methods: {
      getManyPaginate: { ttl: 60 },
      getMany: { ttl: 60 },
      getFirst: { enabled: false }, // never cache this method
    },
  },
});
```

Shorthand:

```typescript
cache: true  // → { ttl: 86400, sensitiveFields: ['password'] }
// with createDefineRepo defaults: inherits app-wide ttl / nullTtl / defaultSetCache
```

## When to use `setCache: true`

| Scenario | Recommendation |
|----------|----------------|
| API `getById` / list for clients | `setCache: true` |
| Auth login / password check | never |
| Uniqueness `getFirst` before create | never |
| Reads inside `tx` | ignored (skipped) |

## Invalidation

### Automatic (mutations)

| Method | Default `invalidate` |
|--------|----------------------|
| `create` | `queries` |
| `updateById` / `deleteById` | `all` |

Modes:

| Mode | Clears |
|------|--------|
| `all` | Entity + query index |
| `entity` | Entity keys for that id |
| `queries` | Query index for the model |
| `none` | Nothing (use inside transactions) |

```typescript
await repo.updateById({
  id,
  data,
  invalidate: 'all',
  tags: ['catalog'], // optional — also clear tagged query keys
});
```

### Manual

```typescript
await repo.invalidateCache({ id, tags: ['catalog'] });
```

### After a transaction

```typescript
await this.tx.execTx(
  async (tx) => {
    await repo.updateById({ tx, id, data, invalidate: 'none' });
  },
  async () => {
    await repo.invalidateCache({ id });
  },
);
```

See [Transactions](transactions.md).

## Tags

Optional indexes for query caches:

```typescript
// read
await repo.getMany({
  where: { categoryId },
  select: { id: true },
  setCache: true,
  cacheTags: [`category:${categoryId}`],
});

// write / manual
await repo.invalidateCache({ tags: [`category:${categoryId}`] });
```

## Source of truth

The repository `cache` block is the only allowlist. A model caches if and only if its repository sets `cache`. There is no Nest `cacheModels` option in 4.0.

## TypeScript DX

Repository method types follow the repo `cache` config:

- With `cache: { … }` or `cache: true` → `setCache`, `cacheTags`, mutation `invalidate`/`tags`, and `invalidateCache` are on the type.
- Without `cache` → those fields are omitted (IDE will not suggest them).

```typescript
// no cache → getManyPaginate args have no setCache
defineAppRepo({ model: 'sparepart' });

// cached → setCache / cacheTags available
defineAppRepo({ model: 'user', cache: { ttl: 86400 } });
```

## Redis adapter

```typescript
import { RedisCacheAdapter, createRedisJsonReviver } from '@prismakit/redis';

const cache = new RedisCacheAdapter({
  url: process.env.REDIS_URL, // or host + port
  prefix: 'myapp',
});

// Custom JSON revive (Date / BigInt / Decimal):
const reviver = createRedisJsonReviver();
```

| Option | Default | Description |
|--------|---------|-------------|
| `url` | — | Redis connection URL |
| `host` | `localhost` | Used when `url` omitted |
| `port` | `6379` | Used when `url` omitted |
| `prefix` | `prismakit` | Key prefix |

## Key schema

Keys include a version segment (`v2`) so codec changes invalidate legacy entries safely:

```
{prefix}:v2:repo:{model}:e:{id}:{method}:{selectHash}
{prefix}:v2:repo:{model}:q:{method}:{queryHash}
{prefix}:v2:repo:{model}:t:{tag}:__idx
```

The Redis adapter serializes `Date`, `BigInt`, `Bytes`, and Prisma `Decimal` via tagged JSON (`__date`, `__bigint`, etc.).

## Debug

```bash
CACHE_DEBUG=true
```

Hits/misses/bypasses are recorded via `cacheDebugStorage` from `@prismakit/core`.

## Custom adapter

Implement `CacheAdapter` from `@prismakit/core` (`get`/`set`/`del`, index helpers, and `safe*` variants). Prefer fail-open semantics for production resilience.
