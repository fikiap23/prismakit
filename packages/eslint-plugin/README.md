# @prismakit/eslint-plugin

ESLint rules that enforce repository-only Prisma access for PrismaKit apps.

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

- No `PrismaClient` / `PrismaService` outside repositories
- No direct `prisma.<model>.*` outside repositories
- Prefer `TransactionService` over raw `$transaction` in feature code

## Docs

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [ESLint reference](https://github.com/fikiap23/prismakit/blob/master/docs/reference/eslint.md)
- [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)


## License

Apache-2.0
