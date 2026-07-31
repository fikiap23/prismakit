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

## Rules

### `prismakit/no-prisma-service-outside-repos`

**Forbidden** outside `**/repositories/**`:

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

## Cursor rule (optional)

Copy [`templates/cursor-rules/data-access.mdc`](../../templates/cursor-rules/data-access.mdc) into your app’s `.cursor/rules/` so agents follow the same contract.

## See also

- [Rules](../RULES.md)
- [Transactions](../guide/transactions.md)
