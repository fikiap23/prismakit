# @prismakit/redis

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
