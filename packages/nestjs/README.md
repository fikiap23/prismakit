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

- [GitHub README](https://github.com/fikiap23/prismakit#readme)
- [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)
- [Agents](https://github.com/fikiap23/prismakit/blob/master/docs/AGENTS.md)

## License

Apache-2.0
