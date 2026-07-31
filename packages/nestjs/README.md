# @prismakit/nestjs

NestJS integration for PrismaKit: `PrismaKitModule`, injectable repositories, and `TransactionService`.

[Documentation](https://github.com/fikiap23/prismakit/blob/master/docs/README.md) · [NestJS guide](https://github.com/fikiap23/prismakit/blob/master/docs/guide/nestjs.md) · [GitHub](https://github.com/fikiap23/prismakit)

## Install

```bash
pnpm add @prismakit/nestjs @prismakit/core
pnpm add @prismakit/redis ioredis   # optional cache
pnpm add -D @prismakit/eslint-plugin
```

## Quick start

```typescript
import { Module } from '@nestjs/common';
import { PrismaKitModule, createInjectableRepository } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';
import { Prisma } from '@prisma/client';

@Module({
  imports: [
    PrismaKitModule.forRoot({
      prisma: prismaClient,
      cache: new RedisCacheAdapter({ prefix: 'myapp' }),
      cacheModels: ['user'], // optional strict allowlist
    }),
  ],
})
export class AppModule {}

export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
  lock: 'users',
});
```

Register `UserRepository` in a feature module `providers`.

**Do not** inject `PrismaClient` into services — use repositories + `TransactionService`.

## Module options

| Option | Description |
|--------|-------------|
| `prisma` | Your Prisma client instance |
| `cache` | Optional `CacheAdapter` |
| `cacheModels` | Optional allowlist for cached models |
| `validateCompose` | Run compose validation on boot |
| `schemaPath` | Path to `schema.prisma` for lock helpers |

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
