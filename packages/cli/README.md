# @prismakit/cli

CLI for PrismaKit: scaffold repositories, codegen relation aliases, validate compose.

## Install

```bash
pnpm add -D @prismakit/cli
# or
npx @prismakit/cli
```

Binary: `prismakit`

## Commands

```bash
# Repository only (default)
npx prismakit generate product --cache

# Full Nest module (controller + service + types)
npx prismakit generate product --cache --full

npx prismakit codegen --write
npx prismakit validate
```

## Docs

- [GitHub README](https://github.com/fikiap23/prismakit#readme)

## License

Apache-2.0
