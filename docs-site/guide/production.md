# Production

PrismaKit is a repository layer on Prisma (cache-aside, auto-compose, Postgres locks, Nest `execTx`) — not an ORM fork. **4.0 is pre-stable.**

## Matrix

- **Node** 20+ · **Prisma** 5+ (CI on 6; Prisma 7 reference starter below)
- **Postgres** required for row locks · Redis optional (fail-open)
- **Nest** 10+ via `@prismakit/nestjs` (`createDefineRepo` / `defineAppRepo`)
- **CI** real Postgres 16 + Redis 7 under `FORCE_INTEGRATION=1` (CRUD, compose, repo locks, stampede, fail-open, Nest `execTx`)

## Reference app

[starter-prismakit-nestjs](https://github.com/fikiap23/starter-prismakit-nestjs) — Nest 11 + Prisma 7 + Redis + MinIO.

## Must-follow rules

- Cache user-facing reads; **never** cache auth / uniqueness `getFirst`
- `execTx` writes use `invalidate: 'none'`; invalidate in `afterCommit`
- Locks need `tx` + Postgres + repo `lock: true`
- Raw Prisma only under `**/repositories/**`
- Composite PK `id` is an object; `getManyCursor` with cursor defaults `skip: 1`
- Wire Nest `telemetry` (`slowThreshold` / `onSlowQuery` / `onEvent`)

Full checklist: [docs/guide/production.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/production.md) · [Upgrade to 4.0](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-to-4.md)
