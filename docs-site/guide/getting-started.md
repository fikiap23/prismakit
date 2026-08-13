# Getting started

PrismaKit wraps your existing Prisma client with a repository factory. Node 20+ and a generated Prisma client are required. **4.0 is pre-stable.**

## Install

**NestJS**

```bash
pnpm add @prismakit/core @prismakit/nestjs
pnpm add @prismakit/redis ioredis   # optional
pnpm add @prismakit/memory          # optional (tests / local)
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
```

**Plain Node**

```bash
pnpm add @prismakit/core
pnpm add @prismakit/memory   # or @prismakit/redis
```

## Create a repository

**Nest (default)**

```typescript
import { createDefineRepo } from '@prismakit/nestjs';
import type { Prisma } from '@prisma/client';

export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
  cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
});

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { sensitiveFields: ['password'] },
  lock: true,
}) {}
```

**Plain Node**

```typescript
import { createRepository, loadPrismaMetaFromSchema } from '@prismakit/core';

loadPrismaMetaFromSchema('prisma/schema.prisma');
const UserRepository = createRepository({
  model: 'user',
  cache: { ttl: 86400 },
  lock: true,
});
```

## Wire NestJS

```typescript
PrismaKitModule.forRoot({
  prisma,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  schemaPath: 'prisma/schema.prisma',
  telemetry: { enabled: true, slowThreshold: 500 },
});
```

Register the repository in feature `providers`. Services call the repository — never `PrismaClient`.

## Next steps

| Topic | This site | Full text |
|-------|-----------|-----------|
| Upgrade to 4.0 | — | [docs/guide/migration-to-4.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-to-4.md) |
| Production | [Production](./production) | [docs/guide/production.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/production.md) |
| Nest starter | — | [starter-prismakit-nestjs](https://github.com/fikiap23/starter-prismakit-nestjs) |
| Repository API | [Repository](./repository) | [docs/guide/repository.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/repository.md) |
| Cache | [Cache](./cache) | [docs/guide/cache.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/cache.md) |
| Rules | — | [docs/RULES.md](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md) |
| Walkthrough | — | [docs/getting-started.md](https://github.com/fikiap23/prismakit/blob/master/docs/getting-started.md) |
