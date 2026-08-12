# PrismaKit errors

PrismaKit throws typed errors from `@prismakit/core` so feature code can branch on `instanceof` without parsing Prisma codes.

## Hierarchy

| Class | When | Code |
|-------|------|------|
| `PrismaKitError` | Base for all kit errors | optional `code` |
| `RecordNotFoundError` | `getThrow*` / missing row | `P2025` |
| `UniqueConstraintError` | Unique violation on create/update | `P2002` |
| `ForeignKeyError` | FK violation | `P2003` |
| `LockNotAvailableError` | Postgres lock not acquired (`NOWAIT`) | `55P03` |
| `UnsupportedProviderError` | Feature needs another datasource (e.g. row locks on SQLite) | `UNSUPPORTED_PROVIDER` |

All extend `PrismaKitError` and set `name` to the class name.

## Mapping raw Prisma errors

Use `wrapPrismaError(err, { model?, where? })` inside repository boundaries. It rethrows typed kit errors for known Prisma codes and passes through anything else.

```typescript
import {
  RecordNotFoundError,
  UniqueConstraintError,
  wrapPrismaError,
} from '@prismakit/core';

try {
  await repo.getThrowById({ id, select: { id: true } });
} catch (err) {
  if (err instanceof RecordNotFoundError) {
    // 404
  }
  throw err;
}
```

## Row locks

`assertLockPrerequisites` throws:

- `Error` when `tx` is missing or lock config is absent
- `UnsupportedProviderError` when the datasource provider is not PostgreSQL

See [Locks](./locks.md).
