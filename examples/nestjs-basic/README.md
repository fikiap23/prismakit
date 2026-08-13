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
import { PrismaKitModule, createDefineRepo } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
  cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
});

PrismaKitModule.forRoot({
  prisma: new PrismaClient(),
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  schemaPath: 'prisma/schema.prisma',
  telemetry: { enabled: true, slowThreshold: 500 },
});

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: true,
}) {}
```

Register `UserRepository` in feature `providers`. Never inject `prisma` into services.

## Features

| Feature | How to use |
|---------|------------|
| `createDefineRepo` | App binder with TypeMap + cache defaults |
| `defaultSetCache` | `cache: { ttl, defaultSetCache: true }` so reads cache unless you pass `setCache: false` |
| Telemetry | `PrismaKitModule.forRoot({ telemetry: { enabled, slowThreshold, onEvent } })` |
| `autoRegisterModels` | `forRoot({ schemaPath, autoRegisterModels: true })` for compose-only stubs |
| `MemoryCacheAdapter` | Prefer `@prismakit/memory` for tests / local dev |

```typescript
import { MemoryCacheAdapter } from '@prismakit/memory';

PrismaKitModule.forRoot({
  prisma,
  cache: new MemoryCacheAdapter({ prefix: 'example' }),
  autoRegisterModels: true,
  telemetry: { enabled: true, onEvent: (e) => console.debug(e) },
});
```

See [Getting started](../../docs/getting-started.md) and [Rules](../../docs/RULES.md).
