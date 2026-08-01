# Auto-compose

Auto-compose loads **relations declared in `select`** through other repositories — not via Prisma `include`.

This keeps cache keys and invalidation per model, and avoids deep nested Prisma includes.

## Requirements

On the **source** repository:

1. `model` is set
2. `scalarFields` is set **or** Prisma DMMF meta is loaded (then scalars are inferred)
3. Nest: repositories are registered as providers (they self-register into `RepositoryRegistry`)
4. Related model repositories are also registered

```typescript
// Preferred: load DMMF once at bootstrap
PrismaKitModule.forRoot({
  prisma,
  dmmf: Prisma.dmmf, // from generated client
});

export const UserRepository = createInjectableRepository({
  model: 'user',
  // scalarFields optional when dmmf is loaded
});

export const PostRepository = createInjectableRepository({
  model: 'post',
  scalarFields: Prisma.PostScalarFieldEnum, // still fine to pass explicitly
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

1. `splitSelect` keeps scalars (+ FK fields from DMMF) for the Prisma query
2. Relation keys are loaded via the target repository (`getMany` / lookups)
3. AutoComposer **always injects the target primary key** into the nested select (even if you omitted `id`) so rows can be mapped back onto parents
4. Results are merged into the payload

You can write nested selects without `id` — e.g. `author: { select: { name: true } }` — and compose still works. The injected PK appears on the composed object.

## Free naming (DMMF)

With `dmmf: Prisma.dmmf` (Prisma 5/6) **or** `schemaPath` (recommended on Prisma 7), PrismaKit reads:

| Need | Source |
|------|--------|
| To-one FK | `relationFromFields` / `@relation(fields: …)` (any name) |
| To-many child FK | Opposite relation's `relationFromFields` |
| Target model | Relation field type → client key (`User` → `user`) |
| Primary key | `@id` / single-field `@@id` |

```typescript
PrismaKitModule.forRoot({
  prisma,
  schemaPath: 'prisma/schema.prisma', // Prisma 7: no Prisma.dmmf
  // dmmf: Prisma.dmmf,               // Prisma 5/6
});
```

Schema naming can match normal Prisma Client usage — no `${relation}Id` convention required.

Without meta, the kit falls back to `${relKey}Id` / `${sourceModel}Id` heuristics.

## Relation aliases (optional)

Aliases remain for edge cases when DMMF is not loaded, or for overrides:

```typescript
import { setRelationModelAliases } from '@prismakit/core';

setRelationModelAliases({
  settings: 'operationalSetting',
});
```

Or generate suggestions:

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
  dmmf: Prisma.dmmf,
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
