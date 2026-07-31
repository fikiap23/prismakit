# AGENTS.md — PrismaKit

Short contract for AI coding agents and humans. Prefer the full guides under [`docs/`](README.md) when implementing features.

## Architecture

```
Controller → Service → Repository → Prisma / CacheAdapter
```

| Layer | Responsibility |
|-------|----------------|
| **Controller** | HTTP only — no Prisma |
| **Service** | Thin orchestration — call repositories / helpers |
| **Helper** | Validate, map, guard — repositories only |
| **Repository** | Only layer that talks to Prisma |

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

`getDelegate` / `toPayload` default from `model`.

Optional allowlist:

```typescript
PrismaKitModule.forRoot({ prisma, cache, cacheModels: ['user', 'feature'] });
```

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

## CLI

```bash
npx prismakit generate <name> --cache
npx prismakit generate <name> --cache --full
npx prismakit codegen
npx prismakit validate
```

## Enforcement

1. [RULES.md](RULES.md) · [getting-started](getting-started.md) · [guides](README.md)
2. ESLint: `@prismakit/eslint-plugin`
3. Runtime: lock/cache validation at repository init

Cursor template: `templates/cursor-rules/data-access.mdc`.
