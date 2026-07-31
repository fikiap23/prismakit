# PrismaKit

Prisma repository kit with **cache-aside**, **auto-compose**, and **row locks**.  
Framework-agnostic core with an optional NestJS adapter — not a Prisma fork.

**Docs:** [docs/README.md](docs/README.md) · [Getting started](docs/getting-started.md) · [Rules](docs/RULES.md)

## Packages

| Package | Description |
|---------|-------------|
| [`@prismakit/core`](https://www.npmjs.com/package/@prismakit/core) | `createRepository`, AutoComposer, locks, pagination, `CacheAdapter` |
| [`@prismakit/redis`](https://www.npmjs.com/package/@prismakit/redis) | Redis `CacheAdapter` |
| [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs) | `PrismaKitModule`, `TransactionService`, injectable repositories |
| [`@prismakit/cli`](https://www.npmjs.com/package/@prismakit/cli) | `prismakit generate / codegen / validate` |
| [`@prismakit/eslint-plugin`](https://www.npmjs.com/package/@prismakit/eslint-plugin) | Enforce repository-only data access |

## Quick start

```bash
pnpm add @prismakit/core @prismakit/nestjs @prismakit/redis
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
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
| Getting started | [docs/getting-started.md](docs/getting-started.md) |
| Repository API | [docs/guide/repository.md](docs/guide/repository.md) |
| NestJS | [docs/guide/nestjs.md](docs/guide/nestjs.md) |
| Cache | [docs/guide/cache.md](docs/guide/cache.md) |
| Auto-compose | [docs/guide/auto-compose.md](docs/guide/auto-compose.md) |
| Locks | [docs/guide/locks.md](docs/guide/locks.md) |
| Transactions | [docs/guide/transactions.md](docs/guide/transactions.md) |
| CLI | [docs/reference/cli.md](docs/reference/cli.md) |
| ESLint | [docs/reference/eslint.md](docs/reference/eslint.md) |
| Rules (required) | [docs/RULES.md](docs/RULES.md) |

**Forbidden:** inject `PrismaClient` / call `prisma.model.*` outside `repositories/`.

```js
// eslint.config.mjs
import prismakit from '@prismakit/eslint-plugin';
export default [prismakit.configs.recommended];
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
