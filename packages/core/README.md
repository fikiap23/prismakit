# @prismakit/core

Framework-agnostic Prisma repository factory with **cache-aside**, **auto-compose**, and **row locks**.

Not a Prisma fork — wrap your existing `PrismaClient`.

## Install

```bash
pnpm add @prismakit/core
# peer: @prisma/client
```

## Quick start

```typescript
import { createRepository } from '@prismakit/core';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const UserRepository = createRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
  lock: 'users', // DB table name (@@map)
});

const users = new UserRepository({ prisma /*, cache */ });

await users.getById({
  id,
  select: { id: true, email: true },
  setCache: true,
});
```

`getDelegate` and `toPayload` default from `model`. Pass them only when you need custom behavior.

## NestJS

Prefer [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs) for DI (`PrismaKitModule`, `createInjectableRepository`, `TransactionService`).

## Docs

- [GitHub README](https://github.com/fikiap23/prismakit#readme)
- [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)
- [Cache](https://github.com/fikiap23/prismakit/blob/master/docs/CACHE.md)

## License

Apache-2.0
