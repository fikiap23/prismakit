# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Per-package changelogs under `packages/*/CHANGELOG.md` are the source of truth for patch/minor notes after 3.0. This root file tracks major theme releases.

## [3.2.0]

### Added
- Real **Postgres + Redis** integration suites: common CRUD/cache/paginate/cursor/bulk/composite PK, smoke-equivalent compose, Nest repo-level `FOR UPDATE` / `NOWAIT` / `SKIP LOCKED`, edge cases (`nullTtl`, `sensitiveFields`, `cacheTags`, stampede coalesce, Redis fail-open)
- CI `FORCE_INTEGRATION=1` + Turbo `passThroughEnv` so integration suites cannot silently skip
- `@prismakit/opentelemetry` — map telemetry events to OpenTelemetry metrics/spans
- `query.slow` telemetry + Nest `queryLog.slowThreshold`
- Production guide + Nest starter as Prisma 7 reference architecture

### Fixed
- Composite primary key `findUnique` where shape for Prisma 6+ (`{ a_b: { a, b } }` instead of flat fields)
- `getManyCursor` defaults `skip: 1` when a cursor is provided (Prisma cursors are inclusive)

## [3.1.0]

### Added
- Full Prisma method parity on repositories: `count`, `exists`, `aggregate`, `groupBy`, `getThrowFirst`, `getManyCursor`, `update`, `delete`, `createManyAndReturn`, `updateManyAndReturn`, `upsertMany`, `queryRaw`, `executeRaw`
- Typed error hierarchy (`RecordNotFoundError`, `UniqueConstraintError`, …)
- Redis tagged codec for `Date` / `Decimal` / `Bytes` / `BigInt`
- `defineAppRepo` model keys typed from `TypeMap.meta.modelProps` + app-level cache defaults
- Publish manifest guard (`pnpm verify:publish`) and Node 20+22 CI with Postgres/Redis services

### Fixed
- Atomic tag invalidation via Lua; silent invalidation failures now emit telemetry
- Row locks refuse non-PostgreSQL providers with a clear error
- Cache key format version bump (legacy entries miss once after upgrade)

## [2.2.0]

### Added
- **AutoComposer**: `maxDepth`, `parallel`, nested `where`/`orderBy`/`take`, compose telemetry, `setComposeOptions`
- **Stampede v2**: exponential backoff, total timeout, in-process `singleflight`, configurable per-repo `cache.stampede`
- **Cache**: FNV-1a `stableHash` (replaces SHA-256), WeakMap select hash / splitSelect caches, `defaultSetCache`, `invalidate: 'stale'`
- **Bulk ops**: `createMany`, `updateMany`, `deleteMany`, `upsert` on repositories
- **Composite primary keys**: `primaryKey: string | string[]`
- **Row locks**: `getFirst` / `getMany` with `lock` + `queryRowsForUpdate`
- **Telemetry**: `setTelemetry` / events for cache, compose, lock, stampede, query
- **NestJS**: `execTx` options (`timeout`, `isolationLevel`), typed `TClient`, `autoRegisterModels`, `compose`, `telemetry`, `queryLog`
- **`@prismakit/memory`**: in-memory `CacheAdapter` for tests/dev
- **Redis**: Lua atomic `invalidateByIndex`, optional gzip compression, pipeline SET+index
- **CLI**: `--helpers` / `--dto` with enhanced `--full` CRUD scaffold
- Docs site (`docs-site`), migration guides, Express/Fastify examples, benchmark package
- TypeScript `src/` included in npm packages for better debugging

### Changed
- Preferred factory alias: `defineRepository` (core + nestjs); older names kept as aliases
- Mutation `tags` is optional (no more `tags: null` boilerplate)

## [2.1.1]

### Fixed
- AutoComposer injects the target primary key into nested relation selects so compose mapping works even when callers omit `id`

## [2.1.0]

### Added
- Conditional repository cache types (`THasCache`): `setCache` / `cacheTags` / invalidation only on the type when repo `cache` is configured

## [2.0.0]

### Added
- BigInt-safe JSON serialization in `@prismakit/redis` (Prisma `BigInt` cache payloads)
- Runnable NestJS example (`examples/nestjs-basic`) with in-memory cache stub
- Nest DI regression tests for `RepositoryRegistry` / `AutoComposer` inject tokens
- `CONTRIBUTING.md` and GitHub Changesets release workflow

### Changed
- All packages aligned to the same version
- Peer dependencies use semver ranges (no `workspace:*` in published peers)
- Softened migration-alias JSDoc; eslint path conventions documented

### Fixed
- NestJS `@prismakit/core` dependency pin drift

## [1.1.1]

### Fixed
- Nest injectable repositories now `@Inject(RepositoryRegistry)` and `@Inject(AutoComposer)` — tsup builds omit `design:paramtypes`, so optional class params were always `undefined` and relation selects were never recomposed

## [1.1.0]

### Added
- `loadPrismaMetaFromSchema(schemaPath)` / `PrismaKitModule` `schemaPath` (Prisma 7) or `dmmf` (Prisma 5/6)
- Free FK / relation naming for auto-compose (uses `@relation(fields)`, not `${rel}Id`)
- `lock: true` and lock resolve by client model key; full column maps from meta
- Optional `primaryKey` / PK from schema/DMMF for `*ById` and row locks
- `scalarFields` optional when meta is loaded

### Changed
- Relation aliases are optional when schema/DMMF meta is present
- Schema parser reads `@relation(fields/references)` and `@id` for meta

## [1.0.10]

### Fixed
- TypeMap payload mapping no longer imports `@prisma/client/runtime/*` (IDE types were blank)
- Prefer explicit `AppRepo<'Model'>` over `InstanceType` for autocomplete

## [1.0.9]

### Fixed
- `PrismaTypeMapLike` accepts view models without create/update ops

## [1.0.8]

### Added
- `createDefineRepo<Prisma.TypeMap>()` — zero-phantom repos typed from Prisma TypeMap (`model` + `scalarFields` only)

## [1.0.7]

### Added
- `defineInjectableRepository` / `defineRepo` — compact Nest factory (phantoms + payload HKT class, no separate types bag)

## [1.0.6]

### Fixed
- Types-bag repositories no longer collapse to `any` in IDEs — public API is an explicit `RepositoryApi` / `ApplyRepoPayload` surface (not `InstanceType` of the impl)
- Loose overload can no longer steal a types-bag as `TSelect`

## [1.0.5]

### Fixed
- Select→payload typing now uses `RepoPayloadHKT` so Prisma `GetPayload` stays precise (generic `payload` functions collapsed to `unknown`)

### Changed
- `RepoTypesDefinition.payload` must be a {@link RepoPayloadHKT} interface (not a generic function)

## [1.0.4]

### Added
- `RepoTypesDefinition` / `ToPayloadFromTypes` — strong select→payload typing bag for thin repositories (no runtime `toPayload`)
- `createRepository` / `createInjectableRepository` overload accepting `RepoTypesDefinition`

### Fixed
- Thin repository usage can keep Prisma `GetPayload` precision via a single types bag

## [0.1.0] — 2026-07-31

### Added

- `@prismakit/core` — `createRepository`, AutoComposer, row locks, pagination, CacheAdapter
- `@prismakit/redis` — RedisCacheAdapter
- `@prismakit/nestjs` — PrismaKitModule, TransactionService, createInjectableRepository
- `@prismakit/eslint-plugin` — rules enforcing repository-only access
- `@prismakit/cli` — generate / codegen / validate
- Docs: RULES.md, AGENTS.md, CACHE.md, Cursor rule template
