# Production guide

PrismaKit is a **repository layer on top of Prisma** — cache-aside, auto-compose, Postgres row locks, Nest `execTx`. It is not an ORM fork.

## Supported matrix

| Surface | Supported |
|---------|-----------|
| Node.js | **20+** (CI: 20 and 22) |
| Prisma | **5+** peer; monorepo CI on **6**; Prisma **7** reference: [starter-prismakit-nestjs](https://github.com/fikiap23/starter-prismakit-nestjs) |
| PostgreSQL | Full features including `FOR UPDATE` / `NOWAIT` / `SKIP LOCKED` |
| MySQL / SQLite / Mongo | CRUD + cache + compose; **row locks are Postgres-only** |
| Redis | Optional via `@prismakit/redis` (fail-open if Redis is down) |
| NestJS | **10+** via `@prismakit/nestjs` |

## Reference architecture

Copy patterns from the Nest starter (Nest 11 + Prisma 7 + Redis + MinIO):

- [starter-prismakit-nestjs](https://github.com/fikiap23/starter-prismakit-nestjs)
- Module wiring: `PrismaKitModule.forRoot` + `telemetry` / `queryLog`
- Checkout: `TransactionService.execTx` + `invalidate: 'none'` + `afterCommit` → `invalidateCache`

## Cache rules (do not skip)

1. User-facing reads: `setCache: true` (or repo `defaultSetCache: true`).
2. Auth / uniqueness / JWT lookups: **never** cache (`getFirst` without `setCache`).
3. Inside a transaction (`tx`): cache is always skipped.
4. `sensitiveFields` (default includes `password`) never enter the cache.
5. Redis down → adapter **fails open** (queries still hit Prisma). Document this for your ops runbook.

## Transactions

```typescript
await this.tx.execTx(
  async (tx) => {
    await this.orders.create({ tx, data, select, invalidate: 'none' });
    await this.stocks.updateById({ tx, id, data, invalidate: 'none' });
  },
  async () => {
    await this.orders.invalidateCache({});
    await this.stocks.invalidateCache({ id });
  },
);
```

Never invalidate inside the transaction body — a rollback would leave cache wrong.

## Row locks

- Repo must declare `lock` config; call must pass `tx`.
- Datasource must be PostgreSQL (`UnsupportedProviderError` otherwise).
- Prefer short transactions; `nowait` and `skipLocked` are mutually exclusive.

## Nest boot safety

| Option | Default | Purpose |
|--------|---------|---------|
| `strictCachedRepos` | `true` | Fail boot if a `cache` repo class is missing from `providers` or listed twice |
| `modulesRoot` | `src/modules` (+ `build/compile/src/modules`) | Where to scan for cached repo classes in Docker images |
| `validateCompose` | `false` | Set `true` in CI/boot to catch bad nested selects early |
| `autoRegisterModels` | unset | Stub uncached repos for compose-only models |

## Observability

- Structured events: [Telemetry](telemetry.md)
- OpenTelemetry metrics/spans: `@prismakit/opentelemetry` → `createPrismaKitTelemetry()`
- Nest `queryLog.slowThreshold` emits `query.slow` and optional `onSlowQuery`

## Escape hatches

Raw SQL / one-off Prisma APIs belong **only** under `**/repositories/**`. Feature services must keep calling repositories. Enforce with `@prismakit/eslint-plugin` recommended config.

## Integration tests (library CI)

PrismaKit CI runs **real Postgres 16 + Redis 7** suites when `FORCE_INTEGRATION=1` (Node 20/22). Coverage includes:

| Suite | What it proves |
|-------|----------------|
| Common | `getById`/`getMany`/`paginate`/`cursor`, mutations + invalidation, `createMany skipDuplicates`, composite PK |
| Compose | 1:1, reverse 1:1, dual N:1, 1:N + `take`, m:n, self-relation, non-PK FK, deep nest, `setCache: false` |
| Repo locks | `lock: { mode: 'update' }`, `nowait` → `LockNotAvailableError`, `skipLocked`, no cache write under `tx` |
| Edge | `nullTtl`, `sensitiveFields`, `cacheTags`, stampede coalesce, Redis fail-open |
| Nest `execTx` | afterCommit invalidate on success; skip invalidate on rollback |

Cheap local compose still uses SQLite + memory (`examples/smoke-test`). For the full stack locally:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/db \
REDIS_URL=redis://localhost:6379 \
FORCE_INTEGRATION=1 pnpm test
```

## Production checklist

- [ ] ESLint `prismakit.configs.recommended`
- [ ] `schemaPath` / DMMF loaded so compose resolves FKs
- [ ] Cached repos registered in feature `providers`
- [ ] Auth paths omit `setCache`
- [ ] Multi-step writes use `execTx` + `afterCommit` invalidation
- [ ] Locks only on Postgres with `tx`
- [ ] Telemetry or OTel wired in staging/prod
- [ ] Health/readiness probes cover Postgres + Redis (if used)
- [ ] `npx prismakit validate --schema prisma/schema.prisma --auto-register` in CI
