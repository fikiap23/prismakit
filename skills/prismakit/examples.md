# PrismaKit core examples

Copy-paste patterns for `@prismakit/core`. Contract: [SKILL.md](SKILL.md).

## 1. New repository from scratch

```typescript
// src/modules/users/repositories/user.repository.ts
import { Prisma } from '@prisma/client';
import { createRepository } from '@prismakit/core';

const DAY = 86_400;

export const userSelectPresets = {
  minimal: { id: true } satisfies Prisma.UserSelect,
  general: { id: true, email: true, name: true } satisfies Prisma.UserSelect,
  withPassword: {
    id: true,
    email: true,
    password: true,
  } satisfies Prisma.UserSelect,
};

export const UserRepoClass = createRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: {
    ttl: DAY,
    nullTtl: 60,
    sensitiveFields: ['password'],
    methods: {
      getFirst: { enabled: false },
    },
  },
  lock: true,
});

export type UserRepository = InstanceType<typeof UserRepoClass>;
```

```typescript
// src/infrastructure/prisma/repos.ts
import { PrismaClient } from '@prisma/client';
import { RedisCacheAdapter } from '@prismakit/redis';
import { UserRepoClass } from '../../modules/users/repositories/user.repository';

const prisma = new PrismaClient();
const cache = new RedisCacheAdapter({
  url: process.env.REDIS_URL,
  prefix: process.env.CACHE_PREFIX ?? 'myapp',
});

export const users = new UserRepoClass({ prisma, cache });
export { prisma };
```

## 2. User-facing read vs uniqueness check

```typescript
import { users } from '../../infrastructure/prisma/repos';
import { userSelectPresets } from './repositories/user.repository';

export async function getProfile(id: string) {
  return users.getThrowById({
    id,
    select: userSelectPresets.general,
    setCache: true,
  });
}

export async function assertEmailFree(email: string) {
  const existing = await users.getFirst({
    where: { email },
    select: userSelectPresets.minimal,
    // never setCache on uniqueness
  });
  if (existing) throw new Error('email taken');
}

export async function verifyLogin(email: string) {
  return users.getFirst({
    where: { email },
    select: userSelectPresets.withPassword,
    // never cache password selects
  });
}
```

## 3. Paginated list with cache tags

```typescript
const page = await products.getManyPaginate({
  where: { categoryId, status: 'ACTIVE' },
  select: { id: true, name: true, price: true },
  orderBy: { createdAt: 'desc' },
  page: 1,
  pageSize: 20,
  setCache: true,
  cacheTags: [`category:${categoryId}`],
});
// page.data, page.meta.totalItems, page.meta.totalPages

await products.updateById({
  id,
  data: { price: 1999 },
  select: { id: true },
  tags: [`category:${categoryId}`],
});
```

## 4. Transaction + invalidate after commit

```typescript
import { prisma, users } from '../../infrastructure/prisma/repos';

export async function renameUser(id: string, name: string) {
  const result = await prisma.$transaction(async (tx) => {
    return users.updateById({
      tx,
      id,
      data: { name },
      select: { id: true, name: true },
      invalidate: 'none',
    });
  });
  await users.invalidateCache({ id });
  return result;
}
```

Prefer wrapping `$transaction` + `afterCommit` in one app helper so every call site stays consistent.

## 5. Transfer with row lock

```typescript
export async function transfer(fromId: string, toId: string, amount: number) {
  const moved = await prisma.$transaction(async (tx) => {
    const from = await wallets.getById({
      tx,
      id: fromId,
      select: { id: true, balance: true },
      lock: { mode: 'update' },
    });
    const to = await wallets.getById({
      tx,
      id: toId,
      select: { id: true, balance: true },
      lock: { mode: 'update' },
    });
    if (!from || !to) throw new Error('wallet missing');
    if (from.balance < amount) throw new Error('insufficient funds');

    await wallets.updateById({
      tx,
      id: fromId,
      data: { balance: from.balance - amount },
      invalidate: 'none',
    });
    await wallets.updateById({
      tx,
      id: toId,
      data: { balance: to.balance + amount },
      invalidate: 'none',
    });
    return { fromId, toId, amount };
  });

  await wallets.invalidateCache({ id: fromId });
  await wallets.invalidateCache({ id: toId });
  return moved;
}
```

## 6. Nested select (auto-compose)

Related repositories must be constructed and registered before the read.

```typescript
const post = await posts.getThrowById({
  id,
  select: {
    id: true,
    title: true,
    author: { select: { name: true } }, // PK injected; no Prisma include
    comments: {
      select: {
        id: true,
        body: true,
        author: { select: { name: true } },
      },
    },
  },
  setCache: true,
});
```

## 7. Unit test with MemoryCacheAdapter

```typescript
import { createRepository } from '@prismakit/core';
import { MemoryCacheAdapter } from '@prismakit/memory';

const UserRepo = createRepository({
  model: 'user',
  scalarFields: { id: 'id', email: 'email', name: 'name' },
  cache: { ttl: 60 },
});

const prisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      where.id === 'u1' ? { id: 'u1', email: 'a@b.c', name: 'Ada' } : null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      if (where.id !== 'u1') throw new Error('missing');
      return { id: 'u1', email: 'a@b.c', name: 'Ada' };
    },
  },
};

const cache = new MemoryCacheAdapter({ prefix: 'test' });
const users = new UserRepo({ prisma, cache });

const select = { id: true, email: true, name: true };

const a = await users.getThrowById({ id: 'u1', select, setCache: true });
const b = await users.getThrowById({ id: 'u1', select, setCache: true }); // cache hit
```

## 8. Scaffold with CLI

```bash
npx prismakit generate product --cache
npx prismakit generate product --cache --full --route products
npx prismakit generate product --prisma-import src/infrastructure/prisma/client --dry-run
npx prismakit codegen --write
npx prismakit validate
```

After repo-only generate: register the class (Nest `providers`, or `new RepoClass({ prisma, cache })` in plain Node). After `--full`: import the feature module in `app.module.ts`.
