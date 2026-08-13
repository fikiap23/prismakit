# NestJS

```typescript
PrismaKitModule.forRoot({
  prisma,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
  schemaPath: 'prisma/schema.prisma',
  strictCachedRepos: true,
  telemetry: {
    enabled: true,
    slowThreshold: 500,
    onEvent: (e) => console.debug(e.type),
  },
});
```

- Repositories: `createDefineRepo` / app `defineAppRepo` (default). Escape hatch: `createInjectableRepository`
- Transactions: `TransactionService.execTx(fn, afterCommit?)`
- Do **not** inject `PrismaClient` in services

Full guide: [docs/guide/nestjs.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/nestjs.md)  
Production: [Production](/guide/production)
