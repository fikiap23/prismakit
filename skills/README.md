# PrismaKit agent skills

Canonical Agent Skills for Cursor, Claude Code, Codex, and any client that reads `SKILL.md`.

| Skill | Use when |
|-------|----------|
| [`prismakit/`](prismakit/SKILL.md) | `@prismakit/core`, repositories, cache, compose, locks, CLI, ESLint |
| [`prismakit-nestjs/`](prismakit-nestjs/SKILL.md) | `@prismakit/nestjs`, `PrismaKitModule`, `TransactionService` |

## Install (recommended)

One command, like other large frameworks. Copies skills into the current app so the team shares them via git:

```bash
npx prismakit skills
```

| Flag | Effect |
|------|--------|
| *(default)* | Project `.cursor/skills/` |
| `--global` / `-g` | `~/.cursor/skills/` (all your projects) |
| `--with-rules` | Also copy `data-access.mdc` into `.cursor/rules/` |
| `--skill prismakit` | One skill only (comma-separated for several) |
| `--list` | Print bundled skills without writing |
| `--dry-run` | Show destinations, write nothing |

Requires `@prismakit/cli` (already in the getting-started install).

## Install via the skills CLI

This `skills/` directory is on the well-known discovery path, so the ecosystem installer works against the GitHub repo:

```bash
npx skills add fikiap23/prismakit
npx skills add fikiap23/prismakit -g -a cursor
```

## After install

Commit `.cursor/skills` in the app repo. Agents pick up `prismakit` / `prismakit-nestjs` from the skill descriptions, or attach with `@prismakit` / `@prismakit-nestjs`.
