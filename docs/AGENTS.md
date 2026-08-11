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
import {
  createInjectableRepository,
  type RepoPayloadHKT,
} from '@prismakit/nestjs';

type FeaturePayloadOf<S> = S extends Prisma.FeatureSelect
  ? Prisma.FeatureGetPayload<{ select: S }>
  : never;

interface FeaturePayloadHKT extends RepoPayloadHKT {
  type(): FeaturePayloadOf<this['_select']>;
}

type FeatureTypes = {
  select: Prisma.FeatureSelect;
  create: Prisma.FeatureCreateInput;
  update: Prisma.FeatureUpdateInput;
  where: Prisma.FeatureWhereInput;
  orderBy: Prisma.FeatureOrderByWithRelationInput;
  payload: FeaturePayloadHKT;
};

export const FeatureRepository = createInjectableRepository<FeatureTypes>({
  model: 'feature',
  scalarFields: Prisma.FeatureScalarFieldEnum,
  cache: { ttl: 60 * 60 * 24 },
  lock: 'features',
});
```

Types bag (`payload` HKT) keeps `GetPayload` precision without a runtime `toPayload`.
`getDelegate` defaults from `model`.

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

Cursor:

- Agent skills: `templates/cursor-skills/` (`prismakit` + `prismakit-nestjs`). Install with `bash templates/cursor-skills/scripts/install.sh`.
- Always-on rule: `templates/cursor-rules/data-access.mdc`.
