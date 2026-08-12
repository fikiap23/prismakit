# Production

PrismaKit is a repository layer on Prisma (cache-aside, auto-compose, Postgres locks, Nest `execTx`) — not an ORM fork.

## Matrix

- **Node** 20+ · **Prisma** 5+ (CI on 6; Prisma 7 reference starter below)
- **Postgres** required for row locks · Redis optional (fail-open)
- **Nest** 10+ via `@prismakit/nestjs`
- **CI** real Postgres 16 + Redis 7 under `FORCE_INTEGRATION=1` (CRUD, compose, repo locks, stampede, fail-open, Nest `execTx`)

## Reference app

[starter-prismakit-nestjs](https://github.com/fikiap23/starter-prismakit-nestjs) — Nest 11 + Prisma 7 + Redis + MinIO.

## Must-follow rules

- Cache user-facing reads; **never** cache auth / uniqueness `getFirst`
- `execTx` writes use `invalidate: 'none'`; invalidate in `afterCommit`
- Locks need `tx` + Postgres
- Raw Prisma only under `**/repositories/**`
- Composite PK `id` is an object; `getManyCursor` with cursor defaults `skip: 1`

Full checklist: [docs/guide/production.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/production.md)
