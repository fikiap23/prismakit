---
'@prismakit/core': major
'@prismakit/nestjs': major
'@prismakit/cli': major
---

Remove relation-alias APIs and `prismakit codegen`. Relation fields resolve from schema/DMMF meta only. Complete `RepositoryApiFromTypeMap` with bulk ops, lock-on-getFirst, and composite PKs. `schemaPath` defaults to `prisma/schema.prisma`; `prismakit validate` loads meta itself (`--schema`, `--auto-register`).
