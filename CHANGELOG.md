# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
