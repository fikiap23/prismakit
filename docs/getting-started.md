# Getting started

This guide gets you from zero to a working repository. Pick **NestJS** or **plain Node**.

## Requirements

- Node.js 20+
- A Prisma project with a generated client (`@prisma/client`)

## Install

### NestJS app

```bash
pnpm add @prismakit/core @prismakit/nestjs
pnpm add @prismakit/redis ioredis          # optional cache
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
```

### Any Node app (no Nest)

```bash
pnpm add @prismakit/core
pnpm add @prismakit/redis ioredis          # optional cache
pnpm add -D @prismakit/eslint-plugin @prismakit/cli
```

## 1. Create a repository

Thin config — `getDelegate` / `toPayload` are optional when `model` is set:

```typescript
import { Prisma } from '@prisma/client';
import { createInjectableRepository } from '@prismakit/nestjs';
// plain Node: import { createRepository } from '@prismakit/core';

export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum, // needed for auto-compose
  cache: { ttl: 86400 },                    // or `cache: true` for defaults
  lock: 'users',                            // optional — DB table (@@map)
});
```

Or scaffold with the CLI:

```bash
npx prismakit generate user --cache
```

## 2. Wire the app

### NestJS

```typescript
import { Module } from '@nestjs/common';
import { PrismaKitModule } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Module({
  imports: [
    PrismaKitModule.forRoot({
      prisma,
      cache: new RedisCacheAdapter({ prefix: 'myapp' }),
      cacheModels: ['user'], // optional strict allowlist
    }),
  ],
})
export class AppModule {}
```

Register `UserRepository` in a feature module:

```typescript
@Module({
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
```

### Plain Node

```typescript
import { createRepository } from '@prismakit/core';
import { RedisCacheAdapter } from '@prismakit/redis';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const cache = new RedisCacheAdapter({ prefix: 'myapp' });

const UserRepoClass = createRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
});

const users = new UserRepoClass({ prisma, cache });
```

## 3. Use it in a service

```typescript
// Prefer setCache on user-facing reads
const user = await this.users.getThrowById({
  id,
  select: { id: true, email: true, name: true },
  setCache: true,
});
```

## 4. Enable ESLint (required)

```js
// eslint.config.mjs
import prismakit from '@prismakit/eslint-plugin';

export default [prismakit.configs.recommended];
```

This blocks `PrismaClient` / `prisma.model.*` outside `**/repositories/**`.

## 5. Install agent skills (recommended)

Same one-liner pattern as other large frameworks. Ships with `@prismakit/cli`:

```bash
npx prismakit skills              # commit .cursor/skills with the app
npx prismakit skills --global     # all projects on this machine
npx prismakit skills --with-rules # plus always-on .cursor/rules/data-access.mdc
```

Or, from GitHub via the skills CLI:

```bash
npx skills add fikiap23/prismakit
```

## Next steps

- [Repository methods](guide/repository.md)
- [NestJS module options](guide/nestjs.md)
- [Cache](guide/cache.md)
- [Transactions](guide/transactions.md)
- [Non-negotiable rules](RULES.md)
