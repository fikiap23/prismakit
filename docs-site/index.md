---
layout: home

hero:
  name: PrismaKit
  text: Repository kit for Prisma
  tagline: Cache-aside, auto-compose, and row locks — without forking Prisma.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Migration guides
      link: /guide/migration
    - theme: alt
      text: GitHub
      link: https://github.com/fikiap23/prismakit

features:
  - title: Cache-aside
    details: Opt-in Redis or in-memory cache at the repository layer with stampede protection and tag invalidation.
  - title: Auto-compose
    details: Nested relations in select presets resolve through registered repositories — cache-aware and framework-agnostic.
  - title: Row locks
    details: SELECT … FOR UPDATE inside transactions for safe read-modify-write without hand-rolled SQL.
  - title: Boundaries
    details: ESLint rules keep Prisma out of services. NestJS adapter or plain Node with createRepository.
---

## Install

```bash
# NestJS
pnpm add @prismakit/core @prismakit/nestjs
pnpm add @prismakit/redis ioredis          # optional Redis cache
pnpm add @prismakit/memory                 # optional in-memory cache (tests / local)

# Plain Node
pnpm add @prismakit/core
pnpm add @prismakit/memory                 # or @prismakit/redis
```

## Value props

| You get | Why it matters |
|---------|----------------|
| One repository API | Reads, writes, pagination, cache, locks in one place |
| Optional cache | Fail-open adapters; never caches sensitive selects |
| Relation compose | Nested `select` without Prisma `include` sprawl |
| Nest or not | `@prismakit/nestjs` or `createRepository` in Express / Fastify |
| Lint boundaries | `@prismakit/eslint-plugin` blocks `prisma.model.*` outside repos |

## Full documentation

This site summarizes the guides. The complete markdown lives in the repo:

- [docs/](https://github.com/fikiap23/prismakit/tree/master/docs)
- [Getting started](https://github.com/fikiap23/prismakit/blob/master/docs/getting-started.md)
- [Rules](https://github.com/fikiap23/prismakit/blob/master/docs/RULES.md)

## Examples

```bash
pnpm --filter @prismakit/example-nestjs-basic start
pnpm --filter @prismakit/example-express start
pnpm --filter @prismakit/example-fastify start
```
