# AGENTS.md — PrismaKit

Short contract for AI coding agents and humans. Prefer the full guides under [`docs/`](README.md) when implementing features. Current line: **4.0** (pre-stable).

## Architecture

```
Controller → Service → Helper → Repository → Prisma / CacheAdapter
```

| Layer | Responsibility |
|-------|----------------|
| **Controller** | HTTP only — no Prisma |
| **Service** | Thin orchestration — call repositories / helpers |
| **Helper** | Validate, map, guard — repositories only |
| **Repository** | Only layer that talks to Prisma |

## Creating a repository (Nest)

Bind `Prisma.TypeMap` once, then define repos with runtime options:

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
import { defineAppRepo } from '../../../infrastructure/prisma/define-app-repo';

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { sensitiveFields: ['password'] },
  lock: true,
}) {}
```

Register the class in the feature module `providers`. Never inject `PrismaClient` / `PrismaService` into services.

Load meta on the module: `PrismaKitModule.forRoot({ schemaPath: 'prisma/schema.prisma' })` (or `dmmf`).

Plain Node: `createRepository` + `loadPrismaMetaFromSchema` / `loadPrismaMetaFromDmmf` from `@prismakit/core`.

## Transactions

```typescript
await this.tx.execTx(
  async (tx) => {
    await this.repo.updateById({ tx, id, data, invalidate: 'none' });
  },
  async () => {
    await this.repo.invalidateCache({ id });
  },
);
```

## Select presets (convention)

- `minimal` — existence / uniqueness (no `setCache`)
- `general` — API responses (`setCache: true` OK)
- `withPassword` — auth only (never cached)

## Composite PK / cursor

- Composite id: `{ postId, tagId }` object — kit maps to Prisma `a_b: { a, b }`
- `getManyCursor` with `cursor` defaults `skip: 1` (non-inclusive next page)

## CLI

```bash
npx prismakit generate <name> --cache
npx prismakit generate <name> --cache --full
npx prismakit validate --auto-register
npx prismakit skills
```

## Enforcement

1. [RULES.md](RULES.md) · [Production](guide/production.md) · [getting-started](getting-started.md) · [Upgrade to 4.0](guide/migration-to-4.md)
2. ESLint: `@prismakit/eslint-plugin`
3. Runtime: lock/cache validation at repository init

Cursor:

- Agent skills: [`skills/`](../skills/) (`prismakit` + `prismakit-nestjs`).
- Install: `npx prismakit skills` (project) or `npx prismakit skills --global`. Ecosystem: `npx skills add fikiap23/prismakit`.
- Always-on rule: `templates/cursor-rules/data-access.mdc` (`npx prismakit skills --with-rules`).
