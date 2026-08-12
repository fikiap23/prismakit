# @prismakit/core


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
