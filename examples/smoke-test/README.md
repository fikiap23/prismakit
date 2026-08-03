# PrismaKit smoke test (real Prisma)

End-to-end check of `@prismakit/core` against a **real** Prisma client + SQLite.

Schema is intentionally messy (`@@map`, `@map`, PK ≠ `id`, dual relations, reverse 1:1, non-PK references, explicit m:n, self-relation) so auto-compose / cache bugs surface quickly.

Row locks (`SELECT … FOR UPDATE`) are **not** covered here — SQLite does not support them. Use Postgres for that.

## Run

From the monorepo root:

```bash
pnpm install
pnpm --filter @prismakit/core build
pnpm --filter @prismakit/memory build
pnpm --filter @prismakit/example-smoke-test test
```

Or inside this package:

```bash
pnpm db:ready   # generate + wipe local SQLite file + db push
pnpm smoke      # run assertions
```

`db:ready` deletes only the local `prisma/dev.db` file (not a production database), then runs a normal `prisma db push`.

Exit code `0` = all cases passed.

## What it checks

- Owning + reverse 1:1
- N:1 with two FKs to the same model
- 1:N with non-`id` PK + root PK injection
- Explicit m:n via join model
- Deep nested select
- FK → unique non-PK (`warehouseCode` → `code`)
- Self-relation
- Nested `take` per parent
- `setCache: false` does not serve stale relation data
- Entity cache invalidation on `updateById` / `updateMany`
- No sibling relation object aliasing
