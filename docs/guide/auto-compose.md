# Auto-compose

Auto-compose loads **relations declared in `select`** through other repositories — not via Prisma `include`.

This keeps cache keys and invalidation per model, and avoids deep nested Prisma includes.

## Requirements

On the **source** repository:

1. `model` is set
2. `scalarFields` is set (usually `Prisma.XScalarFieldEnum`)
3. Nest: repositories are registered as providers (they self-register into `RepositoryRegistry`)
4. Related model repositories are also registered

```typescript
export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
});

export const PostRepository = createInjectableRepository({
  model: 'post',
  scalarFields: Prisma.PostScalarFieldEnum,
});
```

## Usage

```typescript
const post = await this.posts.getThrowById({
  id,
  select: {
    id: true,
    title: true,
    author: { select: { id: true, name: true } }, // relation → auto-composed
  },
  setCache: true,
});
```

What happens:

1. `splitSelect` keeps scalars (+ FK) for the Prisma query
2. Relation keys are loaded via the target repository (`getMany` / lookups)
3. Results are merged into the payload

## FK conventions

| Relation | FK field expected |
|----------|-------------------|
| To-one (`author`) | `authorId` on the source |
| To-many | `${sourceModel}Id` on the target (e.g. `postId`) |

If your schema uses different names, map them with relation aliases.

## Relation aliases

When the Prisma relation field name does not match the registry `model` key:

```typescript
import { setRelationModelAliases } from '@prismakit/core';

setRelationModelAliases({
  settings: 'operationalSetting',
  uploadedByUser: 'user',
});
```

Or generate suggestions from your schema:

```bash
npx prismakit codegen --write
```

See [CLI](../reference/cli.md).

## Validation

```bash
npx prismakit validate
```

Or at Nest boot:

```typescript
PrismaKitModule.forRoot({
  prisma,
  validateCompose: true,
});
```

## Select presets (convention)

Not enforced by the library — recommended for apps:

| Preset | Use |
|--------|-----|
| `minimal` | Existence / uniqueness — **no** `setCache` |
| `general` | API responses — `setCache: true` OK |
| `withPassword` | Auth only — never cache |

```typescript
export const userSelectPresets = {
  minimal: { id: true } satisfies Prisma.UserSelect,
  general: { id: true, email: true, name: true } satisfies Prisma.UserSelect,
};
```
