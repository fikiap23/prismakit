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

## `validate`

Heuristic validation that repository selects are compose-safe. Loads Prisma meta from `schema.prisma` so relation fields resolve to target models without a manual alias map.

```bash
npx prismakit validate [--schema <path>] [--auto-register] [--no-assert]
```

| Flag | Description |
|------|-------------|
| `--schema` | Path to schema (default `prisma/schema.prisma`) |
| `--auto-register` | Seed the mock registry with all schema models (same as Nest `autoRegisterModels: true`) |
| `--no-assert` | Report only; do not throw |

Nest alternative: `PrismaKitModule.forRoot({ validateCompose: true })`.

## `skills`

Install PrismaKit agent skills into Cursor (and compatible clients).

```bash
npx prismakit skills [options]
```

| Flag | Description |
|------|-------------|
| *(default)* | Write `prismakit` + `prismakit-nestjs` to `.cursor/skills/` |
| `--global`, `-g` | Write to `~/.cursor/skills/` instead |
| `--project <path>` | Project root (default `cwd`) |
| `--skill <name>` | One skill, or comma-separated names |
| `--with-rules` | Also copy `data-access.mdc` to `.cursor/rules/` |
| `--list` | Print bundled skills; write nothing |
| `--dry-run` | Print destinations; write nothing |

Skills source: [`skills/`](../../skills/) in this repo, bundled into `@prismakit/cli` on publish.

```bash
npx prismakit skills
npx prismakit skills --global --with-rules
npx prismakit skills --skill prismakit-nestjs
npx skills add fikiap23/prismakit
```

## Help

```bash
npx prismakit help
```
