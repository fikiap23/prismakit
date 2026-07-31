# Repository Cache Guidelines (PrismaKit)

Redis (or any `CacheAdapter`) is a cache-aside layer inside `createRepository`.  
Reads use cache **only when `setCache: true`**.

## Architecture

```
Service → Repository → [CacheAdapter] → Prisma → PostgreSQL
```

- Repository config: `model` + `cache: { ttl, ... }`
- Redis adapter is optional / fail-open (`safe*` methods)
- Writes invalidate according to `invalidate` mode + optional `tags`

## When to use `setCache: true`

**Yes:** user-facing `getThrowById` / `getManyPaginate`  
**No:** auth lookups, uniqueness `getFirst`, JWT validation, reads inside `tx`

## Sensitive fields

Fields in `sensitiveFields` (default `['password']`) are never cached.

## Invalidation

| Mode | Behavior |
|------|----------|
| `all` | entity + queries |
| `entity` | entity keys only |
| `queries` | query index only |
| `none` | skip (use inside `tx`) |

After `TransactionService.execTx`, call `invalidateCache` in `afterCommit`.

## Key schema

```
{prefix}:repo:{model}:e:{id}:{method}:{selectHash}
{prefix}:repo:{model}:q:{method}:{queryHash}
```

## Debug

Set `CACHE_DEBUG=true` to record HIT/MISS/BYPASS via `cacheDebugStorage`.
