# NestJS basic example

Copy-paste wiring for a Nest app. Full docs: [../../docs/README.md](../../docs/README.md).

```typescript
import { Module } from '@nestjs/common';
import { PrismaKitModule } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const cache = new RedisCacheAdapter({ prefix: 'example' });

@Module({
  imports: [
    PrismaKitModule.forRoot({
      prisma,
      cache,
      cacheModels: ['user'],
    }),
  ],
})
export class AppModule {}
```

```typescript
import { Prisma } from '@prisma/client';
import { createInjectableRepository } from '@prismakit/nestjs';

export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
});
```

Register `UserRepository` in a feature module `providers`. Never inject `prisma` into services.

```bash
npx prismakit generate user --cache
```

See [Getting started](../../docs/getting-started.md) and [Rules](../../docs/RULES.md).
