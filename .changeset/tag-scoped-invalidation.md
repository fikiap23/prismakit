---
'@prismakit/core': minor
'@prismakit/redis': patch
'@prismakit/memory': patch
---

Add opt-in `cache.tagScopedInvalidation` for multi-tenant caching: a mutation or `invalidateCache` carrying `tags` clears only those tags plus untagged query caches instead of every query cache of the model.

Cache correctness fixes:

- core: in-process singleflight no longer shares a DB read between different transactions / Prisma clients.
- core: writes made while the cache adapter is not ready (e.g. Redis reconnecting) are no longer silently dropped; the model cache is cleared when the adapter is ready again (new optional `CacheAdapter.onReady`).
- core: write gate is scoped to what was invalidated (one entity / all entities / all queries / tag) instead of the whole model, so frequent writes no longer disable caching for the entire model. Gate keys moved under `:g:`.
- core: `count({ select })` returns the per-field object on both cache hit and miss (was `NaN` on miss); typed via `CountResult`.
- core: stampede lock is released when a cached `getFirst` / `getMany` / `getManyPaginate` / `getManyCursor` / `count` / `exists` / `aggregate` / `groupBy` DB read throws.
- core: `stableHash` only memoizes frozen objects, so a reused-then-mutated `select` / `where` gets a fresh cache key.
- core: TTL jitter never exceeds its percent (short TTLs like `nullTtl: 2` were stretched up to ±50%).
- core: tagged JSON round-trips Prisma 6 `Bytes` (`Uint8Array`), keeps Json values shaped like `{ type: 'Buffer', data }` as plain objects, and warns once when a Decimal is revived without `decimalFactory`.
- redis: index sets only ever extend their TTL (a short-TTL entry no longer shrinks the index and orphans long-TTL entries from invalidation); invalidation uses batched `UNLINK`; implements `onReady`.
- memory: stores values through the same tagged JSON codec as Redis (`structuredClone` turned Prisma Decimal into a plain object).
