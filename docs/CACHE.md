# Repository Cache Guidelines (PrismaKit)

> Full guide: **[guide/cache.md](guide/cache.md)**

Redis (or any `CacheAdapter`) is a cache-aside layer inside `createRepository`.  
Reads use cache **only when `setCache: true`**.

## Quick rules

- Cache only when `setCache: true` **and** repo has `model` + `cache`
- Never cache auth / uniqueness / sensitive selects
- Inside transactions: cache skipped; invalidate in `afterCommit`
- Repository `cache` is the only allowlist (no Nest `cacheModels` in 4.0)

## Invalidate modes

| Mode | Behavior |
|------|----------|
| `all` | entity + queries |
| `entity` | entity keys only |
| `queries` | query index only |
| `none` | skip (use inside `tx`) |

## Debug

Set `CACHE_DEBUG=true` to record HIT/MISS/BYPASS via `cacheDebugStorage` from `@prismakit/core`.
