# @prismakit/nestjs

NestJS integration for PrismaKit: `PrismaKitModule`, `createDefineRepo`, and `TransactionService`.

**Status:** pre-stable (4.0).

[Documentation](https://github.com/fikiap23/prismakit/blob/master/docs/README.md) · [NestJS guide](https://github.com/fikiap23/prismakit/blob/master/docs/guide/nestjs.md) · [Migrate to 4.0](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-to-4.md) · [GitHub](https://github.com/fikiap23/prismakit)

## Install

```bash
pnpm add @prismakit/nestjs @prismakit/core
pnpm add @prismakit/redis ioredis   # optional cache
pnpm add -D @prismakit/eslint-plugin
```

## Quick start

```typescript
import { Module } from '@nestjs/common';
import { PrismaKitModule, createDefineRepo } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';
import type { Prisma } from '@prisma/client';

export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
  cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
});

@Module({
  imports: [
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
  ],
})
export class AppModule {}

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { sensitiveFields: ['password'] },
  lock: true,
}) {}
```

Register `UserRepository` in a feature module `providers`.

**Do not** inject `PrismaClient` into services — use repositories + `TransactionService`.

`createInjectableRepository` is a low-level escape hatch when TypeMap binding is unavailable (results are thinly typed). Prefer `createDefineRepo`.

## Module options

| Option | Description |
|--------|-------------|
| `prisma` | Your Prisma client instance |
| `cache` | Optional `CacheAdapter` |
| `schemaPath` / `dmmf` | Load Prisma meta for compose + `lock: true` (default path `prisma/schema.prisma`) |
| `validateCompose` | Run compose validation on boot |
| `strictCachedRepos` | Fail boot if a cached repo is missing from `providers`, or listed in two modules (default `true`) |
| `compose` | `{ maxDepth, parallel, setCache }` |
| `telemetry` | `{ enabled, slowThreshold, onSlowQuery, onEvent }` or `createPrismaKitTelemetry()` |
| `autoRegisterModels` | Stub repos for compose-only models |

Also supports `PrismaKitModule.forRootAsync`.

## Transactions

```typescript
await this.tx.execTx(
  async (tx) => {
    await this.users.updateById({ tx, id, data, invalidate: 'none' });
  },
  async () => {
    await this.users.invalidateCache({ id });
  },
);
```

## ESLint (required)

```js
import prismakit from '@prismakit/eslint-plugin';
export default [prismakit.configs.recommended];
```

## Docs

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [NestJS guide](https://github.com/fikiap23/prismakit/blob/master/docs/guide/nestjs.md)
- [Transactions](https://github.com/fikiap23/prismakit/blob/master/docs/guide/transactions.md)
- [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)

## License

Apache-2.0
