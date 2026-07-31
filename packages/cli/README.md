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

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [CLI reference](https://github.com/fikiap23/prismakit/blob/master/docs/reference/cli.md)


## License

Apache-2.0
