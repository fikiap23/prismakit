# Getting started

PrismaKit wraps your existing Prisma client with a repository factory. Node 20+ and a generated Prisma client are required.

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

```typescript
import { createInjectableRepository } from '@prismakit/nestjs';
// plain Node: import { createRepository } from '@prismakit/core';

export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
  lock: 'users',
});
```

## Wire NestJS

```typescript
PrismaKitModule.forRoot({
  prisma,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  cacheModels: ['user'],
});
```

Register the repository in feature `providers`. Services call the repository — never `PrismaClient`.

## Next steps

| Topic | This site | Full text |
|-------|-----------|-----------|
| Repository API | [Repository](./repository) | [docs/guide/repository.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/repository.md) |
| Cache | [Cache](./cache) | [docs/guide/cache.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/cache.md) |
| Rules | — | [docs/RULES.md](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md) |
| Walkthrough | — | [docs/getting-started.md](https://github.com/fikiap23/prismakit/blob/master/docs/getting-started.md) |
