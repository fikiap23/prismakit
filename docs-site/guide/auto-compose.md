# Auto-compose

Nested relations in `select` resolve through registered repositories — not Prisma `include`.

Requirements:

1. Source repo has `model`
2. Prisma meta is loaded (`schemaPath` / `dmmf` / `loadPrismaMetaFrom*`)
3. Related model repos are registered (or `autoRegisterModels`)

Full guide: [docs/guide/auto-compose.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/auto-compose.md)
