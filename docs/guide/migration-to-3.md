# Migrating to PrismaKit 3.0

Breaking changes from 2.x. Runtime compose already used schema / DMMF meta; 3.0 removes the leftover alias fallback and completes the TypeMap repository types.

## Relation aliases removed

These public APIs are gone from `@prismakit/core`:

- `RELATION_MODEL_ALIASES`
- `setRelationModelAliases` / `mergeRelationModelAliases` / `getRelationModelAliases`
- `RELATION_MODEL_SUFFIX_RULES`
- `buildRelationModelCandidates`
- `computeRelationAliasesFromSchema` / `candidatesWithoutAliases`

The `prismakit codegen` command is removed. Relation field names (`images`, `parent`, `uploadedByUser`) resolve to registry keys (`productImage`, `category`, `user`) from Prisma schema meta, scoped to the source model.

**Before**

```typescript
import { setRelationModelAliases } from '@prismakit/core';

setRelationModelAliases({
  images: 'productImage',
  parent: 'category',
});
```

**After**

Pass `schemaPath` (defaults to `prisma/schema.prisma`) or `dmmf`. Delete alias files and `codegen:repos` scripts.

```typescript
PrismaKitModule.forRoot({
  prisma,
  // schemaPath defaults to prisma/schema.prisma
  autoRegisterModels: true,
});
```

Validate without a hand-maintained alias map:

```bash
npx prismakit validate --auto-register
```

## TypeMap repository API is complete

`RepositoryApiFromTypeMap` (used by `createDefineRepo`) now matches runtime:

- `createMany`, `updateMany`, `upsert`, `deleteMany`
- `lock` + `orderBy` on `getFirst`
- `lock` on `getMany`
- composite PK `id: string | Record<string, string>` on `*ById`

**Before**

```typescript
type BulkAndLockApi<TCache extends boolean> = {
  createMany(args: ...): Promise<{ count: number }>;
  // ...
};
export type AppRepo<M, TCache extends boolean = false> =
  RepositoryApiFromTypeMap<Prisma.TypeMap, M, TCache> & BulkAndLockApi<TCache>;
```

**After**

```typescript
export const defineAppRepo = createDefineRepo<Prisma.TypeMap>();

export const UserRepository = defineAppRepo({
  model: 'user',
  cache: { ttl: 86_400 },
});
export type UserRepository = InstanceType<typeof UserRepository>;
```

Do not restate model name and cache flag as a second generic — they cannot drift from the factory options.

## Peer ranges

`@prismakit/nestjs`, `@prismakit/cli`, `@prismakit/redis`, and `@prismakit/memory` now require `@prismakit/core` `>=3.0.0`. Upgrade all `@prismakit/*` packages together.
