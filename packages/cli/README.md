# @prismakit/cli

CLI for PrismaKit: scaffold repositories, codegen relation aliases, validate compose.

[Documentation](https://github.com/fikiap23/prismakit/blob/master/docs/README.md) · [CLI reference](https://github.com/fikiap23/prismakit/blob/master/docs/reference/cli.md) · [GitHub](https://github.com/fikiap23/prismakit)

## Install

```bash
pnpm add -D @prismakit/cli
```

Binary: `prismakit`

## Commands

### `generate` — scaffold

```bash
# Repository only (default)
npx prismakit generate product --cache

# Full Nest module (controller + service + types)
npx prismakit generate product --cache --full --route products

# Custom Prisma import path
npx prismakit generate product --prisma-import @prisma/client
```

| Flag | Description |
|------|-------------|
| `--cache` | Include cache config in the repository |
| `--full` | Emit Nest module + controller + service + types |
| `--route` | HTTP route for `--full` |
| `--prisma-import` | Prisma client import (default `@prisma/client`) |
| `--dry-run` | Print files without writing |

### `codegen` — relation aliases

```bash
npx prismakit codegen --write
```

### `validate` — compose safety

```bash
npx prismakit validate
```

### `skills` — Cursor / agent skills

```bash
npx prismakit skills              # .cursor/skills in this app
npx prismakit skills --global     # ~/.cursor/skills
npx prismakit skills --with-rules
```

Also installable from GitHub: `npx skills add fikiap23/prismakit`.

## Docs

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [CLI reference](https://github.com/fikiap23/prismakit/blob/master/docs/reference/cli.md)
- [Getting started](https://github.com/fikiap23/prismakit/blob/master/docs/getting-started.md)

## License

Apache-2.0
