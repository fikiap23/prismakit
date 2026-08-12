# PrismaKit

[![npm](https://img.shields.io/npm/v/@prismakit/core.svg)](https://www.npmjs.com/package/@prismakit/core)
[![license](https://img.shields.io/npm/l/@prismakit/core.svg)](https://github.com/fikiap23/prismakit/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/@prismakit/core.svg)](https://www.npmjs.com/package/@prismakit/core)

Prisma repository kit with **cache-aside**, **auto-compose**, and **row locks**.  
Framework-agnostic core with an optional NestJS adapter — not a Prisma fork.

**Docs:** [docs/README.md](docs/README.md) · [Docs site](docs-site/) · [Getting started](docs/getting-started.md) · [Migration](docs/guide/migration-from-raw-prisma.md) · [Rules](docs/RULES.md)

## Packages

| Package | Description |
|---------|-------------|
| [`@prismakit/core`](https://www.npmjs.com/package/@prismakit/core) | `createRepository`, AutoComposer, locks, pagination, `CacheAdapter` |
| [`@prismakit/redis`](https://www.npmjs.com/package/@prismakit/redis) | Redis `CacheAdapter` |
| [`@prismakit/memory`](https://www.npmjs.com/package/@prismakit/memory) | In-memory `CacheAdapter` (tests / local) |
| [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs) | `PrismaKitModule`, `TransactionService`, injectable repositories |
| [`@prismakit/opentelemetry`](https://www.npmjs.com/package/@prismakit/opentelemetry) | Map telemetry events to OpenTelemetry metrics/spans |
| [`@prismakit/cli`](https://www.npmjs.com/package/@prismakit/cli) | `prismakit generate / validate / skills` |
| [`@prismakit/eslint-plugin`](https://www.npmjs.com/package/@prismakit/eslint-plugin) | Enforce repository-only data access |

## What's new in 3.2

| Area | Highlights |
|------|------------|
| **Real PG + Redis ITs** | CRUD, compose, repo locks, nullTtl/tags/stampede/fail-open, Nest `execTx` — against Postgres 16 + Redis 7 in CI (`FORCE_INTEGRATION=1`) |
| **Composite PK** | `*ById` uses Prisma compound unique shape (`a_b: { a, b }`) |
| **Cursor pages** | `getManyCursor` defaults `skip: 1` when a cursor is set (Prisma cursor is inclusive) |
| **OpenTelemetry** | `@prismakit/opentelemetry` maps kit events to metrics/spans; `query.slow` + `slowThreshold` |
| **Production guide** | Supported matrix, starter reference, ops checklist |

See [upgrade to 3.2](docs/guide/migration-to-3.2.md) · [Production](docs/guide/production.md).

## What's new in 3.1 / 3.0

| Line | Highlights |
|------|------------|
| **3.1** | Full method parity (`count`/`exists`/`aggregate`/`groupBy`/`getManyCursor`), typed errors, Redis Date/BigInt codec, `defineAppRepo` cache defaults — [migration](docs/guide/migration-to-3.1.md) |
| **3.0** | Schema-only compose (no alias maps), TypeMap bulk ops, default `schemaPath` — [migration](docs/guide/migration-to-3.md) |

## Quick start

```bash
pnpm add @prismakit/core @prismakit/nestjs @prismakit/redis
# optional: pnpm add @prismakit/memory
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
npx prismakit skills              # Cursor agent skills → .cursor/skills
```

```typescript
// app.module.ts
PrismaKitModule.forRoot({
  prisma: prismaClient,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  cacheModels: ['user'],
}),
```

```typescript
// user.repository.ts
export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
  lock: 'users',
});
```

Full walkthrough: [Getting started](docs/getting-started.md).

## Documentation

| Topic | Link |
|-------|------|
| Docs site (VitePress) | [docs-site/](docs-site/) |
| Getting started | [docs/getting-started.md](docs/getting-started.md) |
| Repository API | [docs/guide/repository.md](docs/guide/repository.md) |
| NestJS | [docs/guide/nestjs.md](docs/guide/nestjs.md) |
| Cache | [docs/guide/cache.md](docs/guide/cache.md) |
| Auto-compose | [docs/guide/auto-compose.md](docs/guide/auto-compose.md) |
| Locks | [docs/guide/locks.md](docs/guide/locks.md) |
| Transactions | [docs/guide/transactions.md](docs/guide/transactions.md) |
| Migrate from raw Prisma | [docs/guide/migration-from-raw-prisma.md](docs/guide/migration-from-raw-prisma.md) |
| Migrate from `$extends` | [docs/guide/migration-from-prisma-extends.md](docs/guide/migration-from-prisma-extends.md) |
| Migrate from TypeORM | [docs/guide/migration-from-typeorm.md](docs/guide/migration-from-typeorm.md) |
| Production | [docs/guide/production.md](docs/guide/production.md) |
| NestJS starter | [starter-prismakit-nestjs](https://github.com/fikiap23/starter-prismakit-nestjs) (Nest 11 + Prisma 7 + Redis + MinIO) |
| CLI | [docs/reference/cli.md](docs/reference/cli.md) |
| ESLint | [docs/reference/eslint.md](docs/reference/eslint.md) |
| Rules (required) | [docs/RULES.md](docs/RULES.md) |
| Cursor skills | [skills/](skills/) (`npx prismakit skills`) |

**Forbidden:** inject `PrismaClient` / call `prisma.model.*` outside `repositories/`.

```js
// eslint.config.mjs
import prismakit from '@prismakit/eslint-plugin';
export default [prismakit.configs.recommended];
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm --filter @prismakit/example-nestjs-basic start
pnpm --filter @prismakit/example-express start
pnpm --filter @prismakit/example-fastify start
pnpm --filter @prismakit/benchmark start
pnpm --filter @prismakit/docs dev
```

## License

Apache-2.0
