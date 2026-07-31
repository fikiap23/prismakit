# AGENTS.md — PrismaKit

Guide for AI coding agents and humans consuming `@prismakit/*`.

## Architecture

```
Controller → Service → Repository → Prisma / CacheAdapter
```

| Layer | Responsibility |
|-------|----------------|
| **Controller** | HTTP only — no Prisma |
| **Service** | Thin `handle*` orchestration — call repositories / helpers |
| **Helper** | Validate, map, guard — repositories only, never Prisma client |
| **Repository** | Only layer that talks to Prisma (via `createRepository` factory) |

## Creating a repository

```typescript
import { Prisma } from '@prisma/client';
import { createInjectableRepository } from '@prismakit/nestjs';

export const FeatureRepository = createInjectableRepository({
  model: 'feature',
  scalarFields: Prisma.FeatureScalarFieldEnum,
  cache: { ttl: 60 * 60 * 24 },
  lock: 'features',
});
```

`getDelegate` and `toPayload` default from `model`. Pass them only when you need custom behavior.

Strict cache allowlist (optional) via module options:

```typescript
PrismaKitModule.forRoot({
  prisma,
  cache,
  cacheModels: ['user', 'feature'],
});
```

Omit `cacheModels` for fail-open (no allowlist check).

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

`tags` is optional on mutations (defaults to no tag invalidation).

## Select presets

- `minimal` — existence / uniqueness (no `setCache`)
- `general` — API responses (`setCache: true` OK)
- `withPassword` — auth only (never cached)

Relations in select are loaded by **AutoComposer** when `model` + `scalarFields` are set.

## CLI

```bash
npx prismakit generate <name> --cache          # repository only
npx prismakit generate <name> --cache --full   # Nest module scaffold
npx prismakit codegen
npx prismakit validate
```

## Enforcement

1. Docs: [RULES.md](RULES.md), [CACHE.md](CACHE.md)
2. ESLint: `@prismakit/eslint-plugin`
3. Runtime: lock/cache config validation at repository init

See also Cursor rule template: `templates/cursor-rules/data-access.mdc`.
