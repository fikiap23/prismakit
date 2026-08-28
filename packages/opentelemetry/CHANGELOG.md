# @prismakit/opentelemetry

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

## 3.2.1

### Patch Changes

- Republish first release after npm registry package-doc glitch (3.2.0 remains a tombstone).

## 3.2.0

### Minor Changes

- Production trust: Postgres/Redis integration tests in CI (Turbo env passthrough), real FOR UPDATE / NOWAIT / SKIP LOCKED coverage, compose + Nest execTx/afterCommit suites, `query.slow` telemetry threshold, and new `@prismakit/opentelemetry` adapter. Docs: Production guide + starter reference.

### Patch Changes

- Fix composite PK `findUnique` where shape for Prisma 6 (`a_b: { a, b }`) and default `skip: 1` on `getManyCursor`. Expand real Postgres+Redis integration suites (CRUD, compose, repo locks, nullTtl/tags/stampede/fail-open).
- Updated dependencies
- Updated dependencies
  - @prismakit/core@3.2.0
