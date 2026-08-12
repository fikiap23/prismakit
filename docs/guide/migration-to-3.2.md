# Upgrade to PrismaKit 3.2

Notes for apps on **3.1.x** (or late 3.0.x) moving to **3.2.x**. Bump all `@prismakit/*` packages to `^3.2.0` together.

## Composite primary keys

`getById` / `updateById` / `deleteById` (and related `*ById` helpers) now pass Prisma’s compound unique shape for `@@id([a, b])`:

```typescript
// Call site unchanged — still pass a plain object id:
await postTags.getById({
  id: { postId, tagId },
  select: { postId: true, tagId: true },
});
```

Internally this becomes `{ postId_tagId: { postId, tagId } }`. Flat `{ postId, tagId }` as the Prisma `where` is no longer used for composite PKs.

If you previously patched around unique-where errors on join tables, remove those workarounds after upgrading.

## `getManyCursor` skip default

When `cursor` is set, PrismaKit defaults `skip` to `1` so the cursor row is **not** repeated in the next page. Pass `skip: 0` only if you intentionally want inclusive cursor semantics.

```typescript
const page = await repo.getManyCursor({
  orderBy: { id: 'asc' },
  cursor: lastId ? { id: lastId } : undefined,
  take: 20,
  // skip defaults to 1 when cursor is set
});
```

## OpenTelemetry (optional)

```bash
pnpm add @prismakit/opentelemetry @opentelemetry/api
# prefer @prismakit/opentelemetry@^3.2.1 (3.2.0 was a broken first publish)
```

```typescript
import { createPrismaKitTelemetry } from '@prismakit/opentelemetry';

PrismaKitModule.forRoot({
  prisma,
  cache,
  telemetry: createPrismaKitTelemetry({ slowThreshold: 500 }),
  // or: queryLog: { slowThreshold: 500 }
});
```

See [Telemetry](./telemetry.md) and the package README.

## Integration coverage

CI runs real Postgres 16 + Redis 7 suites under `FORCE_INTEGRATION=1` (CRUD, compose, repo locks, stampede, fail-open, Nest `execTx`). Locally:

```bash
DATABASE_URL=postgresql://… REDIS_URL=redis://… FORCE_INTEGRATION=1 pnpm test
```

SQLite smoke (`examples/smoke-test`) remains the cheap local compose suite.

## Migration checklist

1. Bump all `@prismakit/*` to `^3.2.0`.
2. Re-test composite-PK repositories (`PostTag`, `CartItem`, …).
3. Re-check infinite-scroll / cursor clients (duplicate first row should be gone).
4. Optionally wire `@prismakit/opentelemetry` or Nest `queryLog.slowThreshold`.
5. Run `npx prismakit validate --schema prisma/schema.prisma --auto-register`.

See also: [Upgrade to 3.1](./migration-to-3.1.md) · [Production](./production.md) · [Errors](./errors.md)
