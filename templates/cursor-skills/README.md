# PrismaKit Cursor skills

Agent skills that teach Cursor how to use PrismaKit: repository-only data access, cache-aside, auto-compose, row locks, and the NestJS adapter.

These templates are the source of truth. Install them into Cursor so every project on the machine (or one repo) can load them.

## Skills

| Skill | Use when |
|-------|----------|
| [`prismakit/`](prismakit/SKILL.md) | `@prismakit/core`, repositories, cache, compose, locks, CLI, ESLint |
| [`prismakit-nestjs/`](prismakit-nestjs/SKILL.md) | `@prismakit/nestjs`, `PrismaKitModule`, `TransactionService`, injectable repos |

Each skill folder contains:

- `SKILL.md` — contract and workflow (auto-invoked from ambient context)
- `reference.md` — full options / API tables
- `examples.md` — copy-paste snippets
- `review-checklist.md` — gate before the agent finishes

Always-on editor rule (complement, not a replacement): [`../cursor-rules/data-access.mdc`](../cursor-rules/data-access.mdc).

## Install (personal — all projects)

Copies both skills to `~/.cursor/skills/`:

```bash
bash templates/cursor-skills/scripts/install.sh
```

From this directory:

```bash
bash scripts/install.sh
```

Re-run anytime; the script overwrites the installed copies so they match this folder.

## Install (project — this repository only)

```bash
bash templates/cursor-skills/scripts/install.sh --project
# or: bash templates/cursor-skills/scripts/install.sh --project /path/to/app
```

Writes into `<app>/.cursor/skills/prismakit` and `prismakit-nestjs`.

Do **not** install into `~/.cursor/skills-cursor/` — that directory is reserved for Cursor built-ins.

## After install

Open a PrismaKit app and mention repositories, `@prismakit/core`, or `@prismakit/nestjs`. The agent should pick up `prismakit` (and `prismakit-nestjs` in Nest apps) from the skill descriptions.

Manual attach: `@prismakit` / `@prismakit-nestjs` in Cursor chat.
