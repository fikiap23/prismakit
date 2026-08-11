# Auto-compose

Nested relations in a `select` are **not** loaded via Prisma `include`. PrismaKit splits scalars vs relations (`splitSelect`), queries the parent, then `AutoComposer` loads related rows through their registered repositories (cache-aware).

## Requirements

1. Source repo has `model` + `scalarFields` (or Prisma meta loaded)
2. Target model repo is registered in `RepositoryRegistry`
3. Relation FK resolved from schema/DMMF (or `${relation}Id` fallback)

## Select presets

```typescript
general: {
  id: true,
  name: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect
```

Do **not** build per-feature compose helpers — relation field names resolve from schema / DMMF meta.

## Compose options

`setComposeOptions({ maxDepth, parallel })` controls depth and parallel relation fetches.

Full guide: [docs/guide/auto-compose.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/auto-compose.md)
