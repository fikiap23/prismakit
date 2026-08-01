# @prismakit/benchmark

Synthetic micro-benchmarks for `@prismakit/core` helpers. **No Postgres or Prisma client required.**

## What it measures

| Suite | Notes |
|-------|-------|
| `stableHash` vs `crypto.createHash('sha256')` | Cache-key hashing used by PrismaKit |
| `splitSelect` | Nested select split (fresh object vs identity-cached) |
| `singleflight` | Concurrent callers share one in-flight promise |

## Run

From the monorepo root (build core first if needed):

```bash
pnpm build --filter @prismakit/core
pnpm --filter @prismakit/benchmark start
```

## Full DB benches

Repository throughput, Redis stampede, and compose round-trips need a real PostgreSQL database and PrismaClient. Those are not included here — use your app’s integration tests or a dedicated load harness against a seeded schema.
