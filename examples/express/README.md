# Express + PrismaKit example

Minimal Express app using `@prismakit/core` and `@prismakit/memory`. **No Docker, Postgres, or Redis required** — uses an in-memory Prisma-like stub.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build
pnpm --filter @prismakit/example-express start
```

```bash
curl http://localhost:3002/users/demo-user
```

Expected:

```json
{ "id": "demo-user", "email": "ada@example.com", "name": "Ada" }
```

## Production

Replace the stub with a real client and load Prisma meta:

```typescript
import { PrismaClient } from '@prisma/client';
import { createRepository, loadPrismaMetaFromSchema } from '@prismakit/core';
import { RedisCacheAdapter } from '@prismakit/redis';

loadPrismaMetaFromSchema('prisma/schema.prisma');
const prisma = new PrismaClient();
const UserRepository = createRepository({
  model: 'user',
  cache: { ttl: 86400 },
  lock: true,
});
const users = new UserRepository({
  prisma,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
});
```

See [Getting started](../../docs/getting-started.md).
