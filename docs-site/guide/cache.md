# Cache

Cache is **cache-aside** inside the repository. Any `CacheAdapter` works — Redis (`@prismakit/redis`) or in-memory (`@prismakit/memory`).

## When a read hits cache

All of these must be true:

1. `setCache: true` (or `cache.defaultSetCache: true` on the repo)
2. Repository has `model` + `cache` config
3. No `tx` (transactions never use cache)
4. Method not disabled in `cache.methods`
5. Select does not include a sensitive field

## Configure

```typescript
defineAppRepo({
  model: 'user',
  cache: {
    ttl: 86400,
    nullTtl: 60,
    sensitiveFields: ['password'],
    defaultSetCache: true, // optional — opt-in default for reads
    stampede: { /* v2 backoff / lock TTL */ },
  },
});
```

Repository `cache` is the only allowlist (no Nest `cacheModels` in 4.0).

## Writes & invalidation

- Default write invalidation: `'all'`
- Inside transactions: `invalidate: 'none'`, then `invalidateCache` in `afterCommit`
- Modes: `'all' | 'entity' | 'queries' | 'none'`

## Adapters

| Package | Use case |
|---------|----------|
| `@prismakit/redis` | Production shared cache (`createRedisJsonReviver` for custom revive) |
| `@prismakit/memory` | Tests and local dev |

Debug: `CACHE_DEBUG=true` → `cacheDebugStorage` from `@prismakit/core`.

Full guide: [docs/guide/cache.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/cache.md)
