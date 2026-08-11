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
| [`@prismakit/cli`](https://www.npmjs.com/package/@prismakit/cli) | `prismakit generate / codegen / validate` |
| [`@prismakit/eslint-plugin`](https://www.npmjs.com/package/@prismakit/eslint-plugin) | Enforce repository-only data access |

## What's new in 2.2

| Area | Highlights |
|------|------------|
| **Smarter compose** | Compose options (`maxDepth`, parallel), PK injection for nested selects, schema/DMMF-aware FKs |
| **Stampede v2** | Tunable lock TTL, retries, and backoff; in-process `singleflight` |
| **Bulk ops** | `createMany` / `updateMany` on repositories |
| **Composite PK** | `primaryKey: string[]` for `*ById` and row locks |
| **Telemetry** | `setTelemetry` / module `telemetry` for cache, compose, lock, stampede events |
| **Memory adapter** | `@prismakit/memory` — drop-in `MemoryCacheAdapter` without Redis |

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
