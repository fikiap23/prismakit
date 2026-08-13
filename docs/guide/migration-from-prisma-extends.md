# Migration from Prisma `$extends`

Prisma client extensions (`$extends`) are a powerful way to add methods, query middleware, and result shapes on `PrismaClient`. PrismaKit takes a different approach: a **repository factory** outside the client, with optional Nest DI, cache, compose, and ESLint boundaries.

## Mental model

| Prisma `$extends` | PrismaKit |
|-------------------|-----------|
| Extend the client / model API | Wrap the client behind `createRepository` |
| Logic lives on `prisma.user.*` | Logic lives on `UserRepository` |
| Callers still import Prisma (or extended client) | Callers depend on repositories only |
| Cache / locks usually DIY | Built-in cache-aside, stampede, row locks |
| Relations via `include` / nested writes | Auto-compose from nested `select` |

```typescript
// $extends — still “Prisma-shaped”
const prisma = new PrismaClient().$extends({
  model: {
    user: {
      async findCached(id: string) { /* custom */ },
    },
  },
});
await prisma.user.findCached(id);

// PrismaKit — repository-shaped
const users = new UserRepository({ prisma, cache });
await users.getThrowById({ id, select: general, setCache: true });
```

## When PrismaKit is a better fit

Prefer PrismaKit when you need several of:

1. **Cache-aside** — Redis / memory adapters, TTL, null TTL, tags, sensitive-field guards, stampede v2.
2. **Auto-compose** — nested `select` resolved through other repositories (and their caches), not one giant `include`.
3. **Row locks** — `SELECT … FOR UPDATE` wired to `getById` + `tx` without raw SQL in services.
4. **ESLint boundaries** — `@prismakit/eslint-plugin` forbids `prisma.model.*` outside `repositories/`.
5. **Nest transactions** — `TransactionService.execTx` + post-commit `invalidateCache`.
6. **Telemetry** — cache / compose / lock / stampede events via `setTelemetry`.

Stay on `$extends` (or mix carefully) when you only need thin query helpers, computed fields on results, or Prisma-native multi-tenant middleware with no cache/compose story.

## Migration steps

### 1. Keep PrismaClient plain

Remove model extensions that duplicate repository methods. Keep client-level extensions that are orthogonal (logging, soft-delete query filters) if they still run under the same client instance PrismaKit uses.

### 2. Recreate extension methods as repository usage

| Extension idea | PrismaKit approach |
|----------------|--------------------|
| `findCached` / query middleware cache | `cache` config + `setCache: true` |
| Soft-delete helper on model | Shared helper + `where: { deletedAt: null }` in repo calls |
| Nested “with relations” finder | Select preset with relations (auto-compose) |
| Multi-step write helper | Service `handle*` + `TransactionService.execTx` |

### 3. Introduce repositories per model

```typescript
export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: { ttl: 86400 },
}) {}
```

Point services at `UserRepository` instead of the extended client.

### 4. Register Nest module + ESLint

```typescript
PrismaKitModule.forRoot({
  prisma, // plain or lightly extended client
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  schemaPath: 'prisma/schema.prisma',
  autoRegisterModels: true,
  telemetry: { enabled: true, onEvent: (e) => logger.debug(e) },
});
```

Enable the recommended ESLint config so new `$extends` model APIs do not creep back into services.

## Coexistence

You can pass an already-`$extended` client into PrismaKit as long as delegates remain compatible (`findUnique`, `create`, …). Prefer shrinking extensions over time so the public data-access surface is repositories only.

See also: [Repository](./repository.md) · [Cache](./cache.md) · [Auto-compose](./auto-compose.md)
