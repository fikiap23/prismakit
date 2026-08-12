# @prismakit/memory

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
