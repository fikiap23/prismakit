# Upgrade to PrismaKit 3.1

Notes for apps on **3.0.x** moving to **3.1.x**. Peer dependency: `@prismakit/core >=3.1.0 <4` (same for `@prismakit/nestjs`, `@prismakit/redis`, etc.).

## Cache key v2 (one-time miss)

Cache keys now include a version segment and a Date/BigInt/Bytes/Decimal JSON codec (`CACHE_KEY_VERSION = 'v2'`):

```
{prefix}:v2:repo:{model}:e:{id}:{method}:{selectHash}
{prefix}:v2:repo:{model}:q:{method}:{queryHash}
```

After deploy, existing v1 entries **miss** once and repopulate — no manual flush required unless you rely on stale aggregate caches.

See [Cache](./cache.md).

## New repository methods

| Method | Purpose |
|--------|---------|
| `count` | `{ count }` with optional cache |
| `exists` | `{ exists: boolean }` |
| `aggregate` | Prisma `aggregate` delegate |
| `groupBy` | Prisma `groupBy` delegate |
| `getManyCursor` | Cursor pagination (`CursorPage<T>`) |

`updateMany` / `deleteMany` accept a `where` clause (bulk update/delete by filter).

See [Aggregations](./aggregations.md) and [Repository](./repository.md).

## `defineAppRepo` cache defaults

`createDefineRepo` / `defineAppRepo` accepts app-wide cache defaults merged into per-repo `cache: true` or partial overrides:

```typescript
export const defineAppRepo = createDefineRepo<Prisma.TypeMap>({
  cache: { ttl: 86400, nullTtl: 60, defaultSetCache: true },
  schemaPath: 'prisma/schema.prisma',
});

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: true, // uses defineAppRepo defaults
}) {}
```

## Typed model keys

With `createDefineRepo<Prisma.TypeMap>()`, the `model` option is constrained to `TypeMap['meta']['modelProps']` — typos fail at compile time.

## `scalarFields` optional

When `schemaPath` or DMMF meta is loaded, `scalarFields` is inferred from the schema. Omit it in new repos unless the schema file is unavailable at runtime.

## ESLint

`@prismakit/eslint-plugin` 3.1 adds `require-cached-repo-provider` for Nest cached repos. Enable via `prismakit.configs.recommended`.

## Migration checklist

1. Bump all `@prismakit/*` packages to `^3.1.0` together.
2. Expect a short cache warm-up after deploy (v2 keys).
3. Replace raw `prisma.*.count` / cursor lists with repository methods where useful.
4. Run `pnpm prismakit validate` (or `validateSelectCompose`) after nested select changes.

See also: [Migration from raw Prisma](./migration-from-raw-prisma.md) · [Errors](./errors.md)
