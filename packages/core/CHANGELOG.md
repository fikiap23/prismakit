# @prismakit/core

## 4.1.0

### Minor Changes

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

## 4.0.3

### Patch Changes

- Fix `getFirst` / `getThrowFirst` ignoring `orderBy` on the non-lock path (and include `orderBy` in the query cache key).

## 4.0.2

### Patch Changes

- Cache write gate: after invalidate, skip repository cache SET for a short TTL (default 5s via `CacheOptions.writeGateTtlSeconds`) so in-flight GETs cannot repopulate stale rows. Telemetry event `cache.write_gated`. Disable with `writeGateTtlSeconds: false`.

## 4.0.1

### Patch Changes

- 180bb29: Keep Prisma `Date` and `Decimal` through AutoComposer clone and Redis JSON (JSON.stringify toJSON no longer turns them into strings).

## 4.0.0

### Major Changes

- Breaking: clean public API for 4.0 (pre-stable).

  - Core: remove factory aliases (`defineRepository`, `createPrismaRepository`); drop `cacheModels` / `setRegisteredCacheModels`; remove dead options (`compression`, `invalidate: 'stale'`, string `lock`, public `scalarFields`/`primaryKey`/`schemaPath`/`getDelegate`); slim public exports to app-facing surface.
  - Nest: `createDefineRepo` + `createInjectableRepository` only; remove phantoms (`defineInjectableRepository` / `defineRepo` / `defineRepository`) and `createPrismaRepository`; fold `queryLog` into `telemetry` (`slowThreshold` / `onSlowQuery`); Nest barrel no longer re-exports core kitchen sink.
  - Redis: remove deprecated `redisJsonReviver`.
  - CLI: generate scaffolds `defineAppRepo`; skills resolve from `skills/` only.
  - See `docs/guide/migration-to-4.md`.

## 3.2.0

### Minor Changes

- Production trust: Postgres/Redis integration tests in CI (Turbo env passthrough), real FOR UPDATE / NOWAIT / SKIP LOCKED coverage, compose + Nest execTx/afterCommit suites, `query.slow` telemetry threshold, and new `@prismakit/opentelemetry` adapter. Docs: Production guide + starter reference.

### Patch Changes

- Fix composite PK `findUnique` where shape for Prisma 6 (`a_b: { a, b }`) and default `skip: 1` on `getManyCursor`. Expand real Postgres+Redis integration suites (CRUD, compose, repo locks, nullTtl/tags/stampede/fail-open).

## 3.1.0

### Minor Changes

- Production hardening: full Prisma method parity, typed errors, Redis Date/Decimal/Bytes codec, atomic tag invalidation, lock provider guard, defineAppRepo model autocomplete + cache defaults, cache key v2.

## 3.0.2

### Patch Changes

- Read composite `@@id` from schema automatically (`primaryKey` optional). Type `createDefineRepo` `primaryKey` as `string | string[]`. Infer cache API via `interface Repo extends InstanceType<typeof Repo>` so you do not pass `AppRepo<'Model', true>`.

## 3.0.0

### Major Changes

- febf47f: Remove relation-alias APIs and `prismakit codegen`. Relation fields resolve from schema/DMMF meta only. Complete `RepositoryApiFromTypeMap` with bulk ops, lock-on-getFirst, and composite PKs. `schemaPath` defaults to `prisma/schema.prisma`; `prismakit validate` loads meta itself (`--schema`, `--auto-register`).

## 2.2.3

### Patch Changes

- c39c694: Harden auto-compose, cache invalidation, and row locks for messy schemas; add unit coverage and a real Prisma SQLite smoke example.

## 2.2.2

### Patch Changes

- Fix AutoComposer reverse one-to-one relations (e.g. UsagePart.sparepart) so nested selects resolve via target FK instead of returning null.

## 2.1.1

### Patch Changes

- AutoComposer injects the target primary key into nested relation selects so compose mapping works even when callers omit `id`.

## 2.1.0

### Minor Changes

- Conditional repository cache types: `setCache` / `cacheTags` / invalidation only appear when `cache` is configured on the repo.

## 2.0.0

### Minor Changes

- Consumer-ready release: align all package versions, BigInt-safe Redis JSON, safer peerDependency ranges, Nest DI regression tests, and a runnable NestJS example.

## 1.0.3

### Patch Changes

- Enrich npm package READMEs with fuller usage, tables, and doc links.

## 1.0.2

### Patch Changes

- Expand developer documentation (guides + reference) and refresh package README links.

## 1.0.1

### Patch Changes

- Improve npm package READMEs and package metadata (repository, homepage, keywords).

## 1.0.0

### Minor Changes

- 7608dbe: Initial 0.1.0 release: repository factory, Redis adapter, NestJS module, ESLint rules, and CLI.
