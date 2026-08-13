# @prismakit/cli

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

## 3.0.3

### Patch Changes

- Define repos as `export class FooRepository extends defineRepo({ model, cache? }) {}`. Cache fields follow the `cache` option; empty subclasses inherit Nest `@Inject` metadata on module init.

## 3.0.2

### Patch Changes

- Read composite `@@id` from schema automatically (`primaryKey` optional). Type `createDefineRepo` `primaryKey` as `string | string[]`. Infer cache API via `interface Repo extends InstanceType<typeof Repo>` so you do not pass `AppRepo<'Model', true>`.
- Updated dependencies
  - @prismakit/core@3.0.2

## 3.0.0

### Major Changes

- febf47f: Remove relation-alias APIs and `prismakit codegen`. Relation fields resolve from schema/DMMF meta only. Complete `RepositoryApiFromTypeMap` with bulk ops, lock-on-getFirst, and composite PKs. `schemaPath` defaults to `prisma/schema.prisma`; `prismakit validate` loads meta itself (`--schema`, `--auto-register`).

### Patch Changes

- 11e74e5: Add `prismakit skills` to install Cursor agent skills (`prismakit`, `prismakit-nestjs`) into `.cursor/skills` or `~/.cursor/skills`, with optional `--with-rules`.
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

## 2.1.1

### Patch Changes

- AutoComposer injects the target primary key into nested relation selects so compose mapping works even when callers omit `id`.
- Updated dependencies
  - @prismakit/core@2.1.1

## 2.1.0

### Minor Changes

- Conditional repository cache types: `setCache` / `cacheTags` / invalidation only appear when `cache` is configured on the repo.

### Patch Changes

- Updated dependencies
  - @prismakit/core@2.1.0

## 2.0.0

### Minor Changes

- Consumer-ready release: align all package versions, BigInt-safe Redis JSON, safer peerDependency ranges, Nest DI regression tests, and a runnable NestJS example.

### Patch Changes

- Updated dependencies
  - @prismakit/core@2.0.0

## 1.0.3

### Patch Changes

- Enrich npm package READMEs with fuller usage, tables, and doc links.
- Updated dependencies
  - @prismakit/core@1.0.3

## 1.0.2

### Patch Changes

- Expand developer documentation (guides + reference) and refresh package README links.
- Updated dependencies
  - @prismakit/core@1.0.2

## 1.0.1

### Patch Changes

- Improve npm package READMEs and package metadata (repository, homepage, keywords).
- Updated dependencies
  - @prismakit/core@1.0.1

## 1.0.0

### Minor Changes

- 7608dbe: Initial 0.1.0 release: repository factory, Redis adapter, NestJS module, ESLint rules, and CLI.

### Patch Changes

- Updated dependencies [7608dbe]
  - @prismakit/core@1.0.0
