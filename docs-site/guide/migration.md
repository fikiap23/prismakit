# Migration

Adopt PrismaKit incrementally. Pick the guide that matches your starting point:

| From | Guide |
|------|-------|
| Raw `PrismaClient` in services | [Migration from raw Prisma](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-from-raw-prisma.md) |
| Prisma `$extends` client extensions | [Migration from prisma extends](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-from-prisma-extends.md) |
| TypeORM | [Migration from TypeORM](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-from-typeorm.md) |
| PrismaKit 2.x | [Migration to 3.0](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-to-3.md) |
| PrismaKit 3.0.x | [Upgrade to 3.1](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-to-3.1.md) |
| PrismaKit 3.1.x | [Upgrade to 3.2](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-to-3.2.md) |
| PrismaKit 3.2.x | [Upgrade to 4.0](https://github.com/fikiap23/prismakit/blob/master/docs/guide/migration-to-4.md) |

## Suggested order

1. Install `@prismakit/core` (+ Nest/Redis/Memory as needed) and ESLint plugin.
2. Add one repository for a low-risk model; route reads through it.
3. Enable cache only for user-facing selects with no secrets.
4. Move multi-write use cases to `TransactionService.execTx`.
5. Turn on `@prismakit/eslint-plugin` recommended config to freeze the boundary.

Full markdown lives under [`docs/guide/`](https://github.com/fikiap23/prismakit/tree/master/docs/guide).
