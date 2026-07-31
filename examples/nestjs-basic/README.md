# NestJS basic example

Minimal Nest app wired with `@prismakit/nestjs`. **No Docker, Postgres, or Redis required** — uses an in-memory Prisma stub and `MemoryCacheAdapter`.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build
pnpm --filter @prismakit/example-nestjs-basic start
```

Then:

```bash
curl http://localhost:3001/users/demo-user
```

Expected JSON:

```json
{ "id": "demo-user", "email": "ada@example.com", "name": "Ada" }
```

## Production wiring

Replace the stub with a real `PrismaClient` and Redis:

```typescript
import { PrismaKitModule } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';
import { PrismaClient } from '@prisma/client';

PrismaKitModule.forRoot({
  prisma: new PrismaClient(),
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  cacheModels: ['user'],
});
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

Register `UserRepository` in feature `providers`. Never inject `prisma` into services.

See [Getting started](../../docs/getting-started.md) and [Rules](../../docs/RULES.md).
