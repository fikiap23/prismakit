# NestJS

```typescript
PrismaKitModule.forRoot({
  prisma,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  schemaPath: 'prisma/schema.prisma',
  strictCachedRepos: true,
});
```

- Repositories: `createDefineRepo` / `createInjectableRepository` — register in feature `providers`
- Transactions: `TransactionService.execTx(fn, afterCommit?)`
- Do **not** inject `PrismaClient` in services

Full guide: [docs/guide/nestjs.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/nestjs.md)  
Production: [Production](/guide/production)
