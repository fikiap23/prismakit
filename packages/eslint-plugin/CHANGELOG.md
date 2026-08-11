# @prismakit/eslint-plugin

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
