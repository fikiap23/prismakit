# @prismakit/nestjs

NestJS integration for PrismaKit: `PrismaKitModule`, injectable repositories, and `TransactionService`.

## Install

```bash
pnpm add @prismakit/nestjs @prismakit/core
# optional cache
pnpm add @prismakit/redis ioredis
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

Register `UserRepository` in a feature module `providers`. Do **not** inject `PrismaClient` into services — use repositories + `TransactionService.execTx`.

## Docs

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [NestJS guide](https://github.com/fikiap23/prismakit/blob/master/docs/guide/nestjs.md)
- [Transactions](https://github.com/fikiap23/prismakit/blob/master/docs/guide/transactions.md)
- [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)


## License

Apache-2.0
