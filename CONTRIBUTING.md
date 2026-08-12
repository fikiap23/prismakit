# Contributing to PrismaKit

## Setup

- Node.js `>=20`
- pnpm `9` (see `packageManager` in root `package.json`)

```bash
pnpm install
pnpm build
pnpm test
```

## Packages

| Package | Path |
|---------|------|
| `@prismakit/core` | `packages/core` |
| `@prismakit/nestjs` | `packages/nestjs` |
| `@prismakit/redis` | `packages/redis` |
| `@prismakit/memory` | `packages/memory` |
| `@prismakit/opentelemetry` | `packages/opentelemetry` |
| `@prismakit/cli` | `packages/cli` |
| `@prismakit/eslint-plugin` | `packages/eslint-plugin` |

Linked packages share one version (see `.changeset/config.json`).

## Making changes

1. Create a branch from `master`.
2. Implement + add/adjust tests.
3. Run `pnpm typecheck && pnpm test && pnpm build`.
4. For Postgres/Redis integration suites (required in CI via `FORCE_INTEGRATION=1`):

```bash
DATABASE_URL=postgresql://… REDIS_URL=redis://… FORCE_INTEGRATION=1 pnpm test
```

5. Record the change:

```bash
pnpm changeset
```

Describe **user-facing** impact (not implementation details). Linked packages usually bump together.

## Docs & skills

- Guides: `docs/` (mirrored summaries in `docs-site/`)
- Agent skills: `skills/` (bundled into `@prismakit/cli` on build — keep them in sync with the guides)
- After skill edits, rebuild CLI before publishing so `npx prismakit skills` ships the new contract

## Version & publish

Maintainers only:

```bash
pnpm version-packages   # applies changesets, updates CHANGELOGs
pnpm release            # build + changeset publish
```

CI also runs a release workflow on push to `master` when changesets are present (requires `NPM_TOKEN`).

## Example app

```bash
pnpm --filter @prismakit/example-nestjs-basic start
```

See `examples/nestjs-basic/README.md`.

## Docs

Edit files under `docs/`. Keep package READMEs in sync for install/quick-start snippets.

## Code of conduct

Be respectful. File bugs and questions via GitHub Issues.
