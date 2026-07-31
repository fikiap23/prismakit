# NestJS basic example

Minimal wiring (copy into your Nest app):

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
      cacheModels: ['user'], // optional strict allowlist
    }),
  ],
})
export class AppModule {}
```

Repository (thin API — no `getDelegate` / `toPayload`):

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

Or scaffold with the CLI:

```bash
npx prismakit generate user --cache
```

See root [README.md](../../README.md) and [docs/RULES.md](../../docs/RULES.md).
