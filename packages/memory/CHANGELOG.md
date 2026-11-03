# @prismakit/memory

## 4.1.0

### Patch Changes

- 508f639: Add opt-in `cache.tagScopedInvalidation` for multi-tenant caching: a mutation or `invalidateCache` carrying `tags` clears only those tags plus untagged query caches instead of every query cache of the model.

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

- Updated dependencies [508f639]
  - @prismakit/core@4.1.0

## 4.0.3

### Patch Changes

- Fix `getFirst` / `getThrowFirst` ignoring `orderBy` on the non-lock path (and include `orderBy` in the query cache key).
- Updated dependencies
  - @prismakit/core@4.0.3

## 4.0.2

### Patch Changes

- Updated dependencies
  - @prismakit/core@4.0.2

## 4.0.1

### Patch Changes

- Updated dependencies [180bb29]
  - @prismakit/core@4.0.1

## 4.0.0

### Major Changes

- Breaking: clean public API for 4.0 (pre-stable).

  - Core: remove factory aliases (`defineRepository`, `createPrismaRepository`); drop `cacheModels` / `setRegisteredCacheModels`; remove dead options (`compression`, `invalidate: 'stale'`, string `lock`, public `scalarFields`/`primaryKey`/`schemaPath`/`getDelegate`); slim public exports to app-facing surface.
  - Nest: `createDefineRepo` + `createInjectableRepository` only; remove phantoms (`defineInjectableRepository` / `defineRepo` / `defineRepository`) and `createPrismaRepository`; fold `queryLog` into `telemetry` (`slowThreshold` / `onSlowQuery`); Nest barrel no longer re-exports core kitchen sink.
  - Redis: remove deprecated `redisJsonReviver`.
  - CLI: generate scaffolds `defineAppRepo`; skills resolve from `skills/` only.
  - See `docs/guide/migration-to-4.md`.

### Patch Changes

- Updated dependencies
  - @prismakit/core@4.0.0

## 3.2.0

### Patch Changes

- Production trust: Postgres/Redis integration tests in CI (Turbo env passthrough), real FOR UPDATE / NOWAIT / SKIP LOCKED coverage, compose + Nest execTx/afterCommit suites, `query.slow` telemetry threshold, and new `@prismakit/opentelemetry` adapter. Docs: Production guide + starter reference.
- Fix composite PK `findUnique` where shape for Prisma 6 (`a_b: { a, b }`) and default `skip: 1` on `getManyCursor`. Expand real Postgres+Redis integration suites (CRUD, compose, repo locks, nullTtl/tags/stampede/fail-open).
- Updated dependencies
- Updated dependencies
  - @prismakit/core@3.2.0

## 3.1.0

### Minor Changes

- Production hardening: full Prisma method parity, typed errors, Redis Date/Decimal/Bytes codec, atomic tag invalidation, lock provider guard, defineAppRepo model autocomplete + cache defaults, cache key v2.

## 3.0.2

### Patch Changes

- Updated dependencies
  - @prismakit/core@3.0.2

## 3.0.0

### Major Changes

- Released in lockstep with `@prismakit/core@3.0.0` (schema-meta relation resolution; TypeMap bulk ops).

### Patch Changes

- Updated dependencies [febf47f]
  - @prismakit/core@3.0.0

## 2.2.3

### Patch Changes

- c39c694: Harden auto-compose, cache invalidation, and row locks for messy schemas; add unit coverage and a real Prisma SQLite smoke example.
- Updated dependencies [c39c694]
  - @prismakit/core@2.2.3

## 2.2.2

### Patch Changes

- Updated dependencies
  - @prismakit/core@2.2.2
