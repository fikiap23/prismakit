# ESLint plugin reference

Package: [`@prismakit/eslint-plugin`](https://www.npmjs.com/package/@prismakit/eslint-plugin)

Enforces the PrismaKit data-access contract: **only repositories talk to Prisma**.

## Setup (flat config)

```bash
pnpm add -D @prismakit/eslint-plugin
```

```js
// eslint.config.mjs
import prismakit from '@prismakit/eslint-plugin';

export default [
  prismakit.configs.recommended,
  // ...your other configs
];
```

`recommended` turns all rules on at **error**.

## Allowed paths (recommended layout)

Rules allow Prisma client usage only under these path patterns (forward slashes):

| Pattern | Purpose |
|---------|---------|
| `**/repositories/**` | Feature repositories (`defineRepo` / `createInjectableRepository`) |
| `**/infrastructure/prisma/**` | PrismaService wiring, `defineRepo` factory, schema helpers |
| `**/node_modules/**` | Dependencies |
| `packages/(core\|nestjs\|redis)/**` | PrismaKit itself (monorepo) |

Put all `prisma.model.*` calls in `repositories/`. Keep a thin Prisma module under `infrastructure/prisma/` (or equivalent) for client construction only — not for feature queries.

If your app uses different folders, either mirror this layout or fork/adjust the plugin allowlist in a future release.

## Rules

### `prismakit/no-prisma-service-outside-repos`

**Forbidden** outside `**/repositories/**` (and the infrastructure Prisma folder above):

- Injecting or referencing `PrismaService`
- Injecting or referencing `PrismaClient`

```typescript
// BAD — in a service
constructor(private readonly prisma: PrismaClient) {}

// GOOD — in a service
constructor(private readonly users: UserRepository) {}
```

### `prismakit/no-direct-prisma-delegate`

**Forbidden** outside repositories:

```typescript
// BAD
await this.prisma.user.findUnique({ where: { id } });

// GOOD
await this.users.getById({ id, select: { id: true } });
```

### `prismakit/require-transaction-service`

**Forbidden** in feature code:

```typescript
// BAD
await this.prisma.$transaction(async (tx) => { /* ... */ });

// GOOD
await this.tx.execTx(async (tx) => { /* ... */ });
```

Use `TransactionService` from `@prismakit/nestjs`.

### `prismakit/require-cached-repo-provider`

A repository with `cache` must appear in some Nest module `providers: [...]`. Otherwise Nest never constructs it and `autoRegisterModels` installs an **uncached** stub — the `cache` block is a no-op.

Compose-only stubs (no `cache`) are allowed to stay out of `providers`.

```typescript
// BAD — cache config, but not in UserModule.providers
export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 86_400 },
}) {}

// GOOD
@Module({
  providers: [UserService, UserRepository, ProfileRepository],
})
export class UserModule {}
```

## Cursor rule and skills (optional)

```bash
npx prismakit skills              # .cursor/skills in this app
npx prismakit skills --global     # ~/.cursor/skills
npx prismakit skills --with-rules # also copy data-access.mdc into .cursor/rules
```

Ecosystem installer (discovers [`skills/`](../../skills/) in this repo):

```bash
npx skills add fikiap23/prismakit
```

Manual copies: [`templates/cursor-rules/data-access.mdc`](../../templates/cursor-rules/data-access.mdc) → `.cursor/rules/`.

## See also

- [Rules](../RULES.md)
- [Transactions](../guide/transactions.md)
