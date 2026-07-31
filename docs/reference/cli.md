# CLI reference

Package: [`@prismakit/cli`](https://www.npmjs.com/package/@prismakit/cli)

```bash
pnpm add -D @prismakit/cli
npx prismakit <command>
```

## `generate`

Scaffold a repository (default) or a full Nest feature module.

```bash
npx prismakit generate <name> [options]
```

| Flag | Description |
|------|-------------|
| `--cache` | Include cache block in the repository |
| `--full` | Emit Nest module + controller + service + select/where types |
| `--route <path>` | HTTP route segment for `--full` (default from name) |
| `--prisma-import <path>` | Prisma import path (default `@prisma/client`) |
| `--dry-run` | Print files without writing |

Examples:

```bash
# Thin repository only
npx prismakit generate product --cache

# Full Nest module
npx prismakit generate product --cache --full --route products

# Custom Prisma client path
npx prismakit generate product --prisma-import src/prisma/client
```

Default output path: `src/modules/<kebab>/repositories/<kebab>.repository.ts`

After `--full`, register `*Module` in `app.module.ts`.  
After repo-only, register the repository class in your feature `providers`.

## `codegen`

Suggest relation-field → registry-model aliases from `schema.prisma`.

```bash
npx prismakit codegen [--schema <path>] [--write] [--out <file>]
```

| Flag | Description |
|------|-------------|
| `--schema` | Path to schema (default `prisma/schema.prisma`) |
| `--write` | Write output file |
| `--out` | Output path (used with `--write`) |

Apply aliases at bootstrap with `setRelationModelAliases` / `mergeRelationModelAliases` from `@prismakit/core`.

See [Auto-compose](../guide/auto-compose.md).

## `validate`

Heuristic validation that repository selects are compose-safe.

```bash
npx prismakit validate [--no-assert]
```

| Flag | Description |
|------|-------------|
| `--no-assert` | Report only; do not throw |

Nest alternative: `PrismaKitModule.forRoot({ validateCompose: true })`.

## Help

```bash
npx prismakit help
```
