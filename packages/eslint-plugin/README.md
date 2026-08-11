# @prismakit/eslint-plugin

ESLint rules that enforce **repository-only** Prisma access for PrismaKit apps.

[Documentation](https://github.com/fikiap23/prismakit/blob/master/docs/README.md) · [ESLint reference](https://github.com/fikiap23/prismakit/blob/master/docs/reference/eslint.md) · [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)

## Install

```bash
pnpm add -D @prismakit/eslint-plugin
```

## Usage (flat config)

```js
// eslint.config.mjs
import prismakit from '@prismakit/eslint-plugin';

export default [
  prismakit.configs.recommended,
];
```

## Rules

| Rule | Enforces |
|------|----------|
| `prismakit/no-prisma-service-outside-repos` | No `PrismaClient` / `PrismaService` outside `**/repositories/**` |
| `prismakit/no-direct-prisma-delegate` | No `prisma.<model>.*` outside repositories |
| `prismakit/require-transaction-service` | No raw `.$transaction` in feature code — use `TransactionService` |
| `prismakit/require-cached-repo-provider` | Cached `defineAppRepo({ cache })` classes must be in a Nest `providers` array |

```typescript
// BAD
constructor(private readonly prisma: PrismaClient) {}
await this.prisma.user.findUnique({ where: { id } });

// GOOD
constructor(private readonly users: UserRepository) {}
await this.users.getById({ id, select: { id: true } });
```

## Docs

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [ESLint reference](https://github.com/fikiap23/prismakit/blob/master/docs/reference/eslint.md)
- [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)

## License

Apache-2.0
