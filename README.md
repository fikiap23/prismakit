# PrismaKit

[![npm](https://img.shields.io/npm/v/@prismakit/core.svg)](https://www.npmjs.com/package/@prismakit/core)
[![license](https://img.shields.io/npm/l/@prismakit/core.svg)](https://github.com/fikiap23/prismakit/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/@prismakit/core.svg)](https://www.npmjs.com/package/@prismakit/core)

Prisma repository kit with **cache-aside**, **auto-compose**, and **row locks**.  
Framework-agnostic core with an optional NestJS adapter — not a Prisma fork.

**Status:** **pre-stable** (4.0 public API cleanup). Prefer pinning exact versions until the 4.x line freezes.

**Docs:** [docs/README.md](docs/README.md) · [Docs site](docs-site/) · [Getting started](docs/getting-started.md) · [Migrate to 4.0](docs/guide/migration-to-4.md) · [Rules](docs/RULES.md)

## Packages

| Package | Description |
|---------|-------------|
| [`@prismakit/core`](https://www.npmjs.com/package/@prismakit/core) | `createRepository`, AutoComposer, locks, pagination, `CacheAdapter` |
| [`@prismakit/redis`](https://www.npmjs.com/package/@prismakit/redis) | Redis `CacheAdapter` |
| [`@prismakit/memory`](https://www.npmjs.com/package/@prismakit/memory) | In-memory `CacheAdapter` (tests / local) |
| [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs) | `PrismaKitModule`, `TransactionService`, `createDefineRepo` |
| [`@prismakit/opentelemetry`](https://www.npmjs.com/package/@prismakit/opentelemetry) | Map telemetry events to OpenTelemetry metrics/spans |
| [`@prismakit/cli`](https://www.npmjs.com/package/@prismakit/cli) | `prismakit generate / validate / skills` |
| [`@prismakit/eslint-plugin`](https://www.npmjs.com/package/@prismakit/eslint-plugin) | Enforce repository-only data access |

## What's new in 4.0

| Area | Highlights |
|------|------------|
| **Single factories** | Core: `createRepository` only. Nest default: `createDefineRepo` / app `defineAppRepo` |
| **Thin repo options** | `model`, `cache?`, `lock?: true \| RepositoryLockConfig`, `toPayload?` — meta from schema/DMMF |
| **Telemetry** | Nest `queryLog` folded into `telemetry` (`slowThreshold`, `onSlowQuery`, `onEvent`) |
| **Removed** | `cacheModels`, string `lock` shorthands, Nest/core aliases (`defineRepository`, `createPrismaRepository`, …) |

See [upgrade to 4.0](docs/guide/migration-to-4.md) · [Production](docs/guide/production.md).

## Quick start

```bash
pnpm add @prismakit/core @prismakit/nestjs @prismakit/redis
# optional: pnpm add @prismakit/memory
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
npx prismakit skills              # Cursor agent skills → .cursor/skills
```

```typescript
// define-app-repo.ts
import { createDefineRepo } from '@prismakit/nestjs';
import type { Prisma } from '@prisma/client'; // or generated client path

export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
  cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
});
```

```typescript
// app.module.ts
PrismaKitModule.forRoot({
  prisma: prismaClient,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  schemaPath: 'prisma/schema.prisma',
  telemetry: {
    enabled: true,
    slowThreshold: 500,
    onEvent: (e) => console.debug(e.type),
  },
}),
```

```typescript
// user.repository.ts
export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { sensitiveFields: ['password'] },
  lock: true,
}) {}
```

Plain Node (no Nest):

```typescript
import { createRepository, loadPrismaMetaFromSchema } from '@prismakit/core';

loadPrismaMetaFromSchema('prisma/schema.prisma');
const UserRepo = createRepository({ model: 'user', cache: { ttl: 86400 }, lock: true });
const users = new UserRepo({ prisma, cache });
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
| Migrate to 4.0 | [docs/guide/migration-to-4.md](docs/guide/migration-to-4.md) |
| Migrate from raw Prisma | [docs/guide/migration-from-raw-prisma.md](docs/guide/migration-from-raw-prisma.md) |
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
