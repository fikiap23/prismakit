# Getting started

This guide gets you from zero to a working repository. Pick **NestJS** or **plain Node**.

PrismaKit **4.0** is **pre-stable** — see [Upgrade to 4.0](guide/migration-to-4.md).

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

### NestJS (default)

Bind `Prisma.TypeMap` once, then define repos with runtime options only:

```typescript
// src/infrastructure/prisma/define-app-repo.ts
import { createDefineRepo } from '@prismakit/nestjs';
import type { Prisma } from '@prisma/client'; // or generated client path

export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
  cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
});
```

```typescript
// user.repository.ts
import { defineAppRepo } from 'src/infrastructure/prisma/define-app-repo';

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { sensitiveFields: ['password'] },
  lock: true, // optional — table/columns from Prisma meta
}) {}
```

Or scaffold with the CLI:

```bash
npx prismakit generate user --cache
```

### Plain Node

```typescript
import { createRepository, loadPrismaMetaFromSchema } from '@prismakit/core';
import { RedisCacheAdapter } from '@prismakit/redis';
import { PrismaClient } from '@prisma/client';

loadPrismaMetaFromSchema('prisma/schema.prisma');
// Prisma 5/6: loadPrismaMetaFromDmmf(Prisma.dmmf)

const prisma = new PrismaClient();
const cache = new RedisCacheAdapter({ prefix: 'myapp' });

const UserRepoClass = createRepository({
  model: 'user',
  cache: { ttl: 86400 },
  lock: true,
});

const users = new UserRepoClass({ prisma, cache });
```

## 2. Wire NestJS

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
      schemaPath: 'prisma/schema.prisma', // default; Prisma 5/6: dmmf: Prisma.dmmf
      telemetry: {
        enabled: true,
        slowThreshold: 500,
      },
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

- [Upgrade to 4.0](guide/migration-to-4.md)
- [Production guide](guide/production.md) — supported matrix and checklist
- [Reference Nest starter](https://github.com/fikiap23/starter-prismakit-nestjs) — Nest 11 + Prisma 7 + Redis + MinIO
- [Repository methods](guide/repository.md)
- [NestJS module options](guide/nestjs.md)
- [Cache](guide/cache.md)
- [Transactions](guide/transactions.md)
- [Non-negotiable rules](RULES.md)
