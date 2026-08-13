# @prismakit/eslint-plugin

## 4.0.0

### Major Changes

- Breaking: clean public API for 4.0 (pre-stable).

  - Core: remove factory aliases (`defineRepository`, `createPrismaRepository`); drop `cacheModels` / `setRegisteredCacheModels`; remove dead options (`compression`, `invalidate: 'stale'`, string `lock`, public `scalarFields`/`primaryKey`/`schemaPath`/`getDelegate`); slim public exports to app-facing surface.
  - Nest: `createDefineRepo` + `createInjectableRepository` only; remove phantoms (`defineInjectableRepository` / `defineRepo` / `defineRepository`) and `createPrismaRepository`; fold `queryLog` into `telemetry` (`slowThreshold` / `onSlowQuery`); Nest barrel no longer re-exports core kitchen sink.
  - Redis: remove deprecated `redisJsonReviver`.
  - CLI: generate scaffolds `defineAppRepo`; skills resolve from `skills/` only.
  - See `docs/guide/migration-to-4.md`.

## 3.2.0

### Patch Changes

- Production trust: Postgres/Redis integration tests in CI (Turbo env passthrough), real FOR UPDATE / NOWAIT / SKIP LOCKED coverage, compose + Nest execTx/afterCommit suites, `query.slow` telemetry threshold, and new `@prismakit/opentelemetry` adapter. Docs: Production guide + starter reference.
- Fix composite PK `findUnique` where shape for Prisma 6 (`a_b: { a, b }`) and default `skip: 1` on `getManyCursor`. Expand real Postgres+Redis integration suites (CRUD, compose, repo locks, nullTtl/tags/stampede/fail-open).

## 3.1.0

### Minor Changes

- Production hardening: full Prisma method parity, typed errors, Redis Date/Decimal/Bytes codec, atomic tag invalidation, lock provider guard, defineAppRepo model autocomplete + cache defaults, cache key v2.

## 3.0.9

### Patch Changes

- `require-cached-repo-provider` errors when the same repository class appears in more than one module `providers` array (duplicate Nest instances).

## 3.0.8

### Patch Changes

- `require-cached-repo-provider` accepts a cached class listed in **any** Nest `*.module.ts` `providers` array, not only ancestor modules of the repository file.

## 3.0.7

### Patch Changes

- `require-cached-repo-provider` also flags the feature `*.module.ts` `providers` array when a sibling `repositories/` class has `cache` but is not registered.

## 3.0.6

### Patch Changes

- Add `prismakit/require-cached-repo-provider`: repository classes with `cache` must appear in a Nest module `providers` array, so `autoRegisterModels` cannot silently replace them with an uncached stub.

## 3.0.0

### Major Changes

- Released in lockstep with `@prismakit/core@3.0.0` (schema-meta relation resolution; TypeMap bulk ops).

## 2.2.3

### Patch Changes

- c39c694: Harden auto-compose, cache invalidation, and row locks for messy schemas; add unit coverage and a real Prisma SQLite smoke example.

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
