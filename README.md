# PrismaKit

Prisma repository kit with **cache-aside**, **auto-compose**, and **row locks**.  
Extracted from production NestJS patterns — not a Prisma fork.

## Packages

| Package | Description |
|---------|-------------|
| [`@prismakit/core`](packages/core) | `createRepository`, AutoComposer, locks, pagination, `CacheAdapter` |
| [`@prismakit/redis`](packages/redis) | Redis `CacheAdapter` |
| [`@prismakit/nestjs`](packages/nestjs) | `PrismaKitModule`, `TransactionService`, injectable repositories |
| [`@prismakit/cli`](packages/cli) | `prismakit generate / codegen / validate` |
| [`@prismakit/eslint-plugin`](packages/eslint-plugin) | Enforce repository-only data access (required) |

## Quick start (NestJS)

```bash
pnpm add @prismakit/core @prismakit/redis @prismakit/nestjs
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
```

```typescript
// app.module.ts
import { PrismaKitModule } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';

PrismaKitModule.forRoot({
  prisma: prismaClient,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  cacheModels: ['user'], // optional strict allowlist; omit = fail-open
}),
```

```typescript
// user.repository.ts
import { Prisma } from '@prisma/client';
import { createInjectableRepository } from '@prismakit/nestjs';

export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum, // needed for AutoComposer
  cache: { ttl: 86400 },
  lock: 'users', // optional — DB table name (@@map)
});
```

Register `UserRepository` in your feature module `providers`. No hand-written `getDelegate` / `toPayload`.

## Rules (required)

See [RULES.md](docs/RULES.md) and [AGENTS.md](docs/AGENTS.md).

**Forbidden:** inject `PrismaClient` / call `prisma.model.*` outside `repositories/`.  
Use repositories + `TransactionService.execTx` only.

Enable ESLint:

```js
// eslint.config.mjs
import prismakit from '@prismakit/eslint-plugin';

export default [
  prismakit.configs.recommended,
];
```

Copy Cursor rule: [`templates/cursor-rules/data-access.mdc`](templates/cursor-rules/data-access.mdc)

## Cache

Full guide: [docs/CACHE.md](docs/CACHE.md)

- Cache only when `setCache: true` **and** repo has `model` + `cache`
- Never cache sensitive selects
- Inside transactions: cache skipped; invalidate in `afterCommit`

## CLI

```bash
# Repository only (default)
npx prismakit generate product --cache

# Full Nest module (controller + service + types)
npx prismakit generate product --cache --full

npx prismakit codegen
npx prismakit validate
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## License

Apache-2.0
