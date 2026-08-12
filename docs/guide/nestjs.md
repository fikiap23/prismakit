# NestJS integration

Package: [`@prismakit/nestjs`](https://www.npmjs.com/package/@prismakit/nestjs)

## Setup

```typescript
import { Module } from '@nestjs/common';
import { PrismaKitModule } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';

@Module({
  imports: [
    PrismaKitModule.forRoot({
      prisma: prismaClient,
      cache: new RedisCacheAdapter({ prefix: 'myapp' }),
    }),
  ],
})
export class AppModule {}
```

### `PrismaKitModuleOptions`

| Option | Required | Description |
|--------|----------|-------------|
| `prisma` | yes | Your `PrismaClient` (or compatible) instance |
| `cache` | no | `CacheAdapter` (e.g. `RedisCacheAdapter`) |
| `cacheModels` | no | Optional extra allowlist. Omit — repo `cache` is the source of truth |
| `schemaPath` | no | Path to `prisma/schema.prisma` for lock helpers |
| `validateCompose` | no | When `true`, run compose validation on module init |
| `strictCachedRepos` | no | Fail boot when a `cache` repo is missing from `providers`, or listed in two modules (default `true`) |
| `modulesRoot` | no | Directory scanned by `strictCachedRepos` (default `src/modules`) |

### Async config

```typescript
PrismaKitModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    prisma: prismaClient,
    cache: new RedisCacheAdapter({
      url: config.get('REDIS_URL'),
      prefix: config.get('CACHE_PREFIX') ?? 'myapp',
    }),
  }),
});
```

## Injectable repositories

```typescript
import { Prisma } from '@prisma/client';
import { createInjectableRepository } from '@prismakit/nestjs';

export const ProductRepository = createInjectableRepository({
  model: 'product',
  scalarFields: Prisma.ProductScalarFieldEnum,
  cache: { ttl: 300 },
});
```

Register the returned class in a feature module `providers`. Never inject `prisma` into services. If `cache` is set on the class but it is omitted from `providers`, Nest boot throws (`strictCachedRepos`).

When `cache` is set on the repository options, TypeScript exposes `setCache` / `cacheTags` on reads and invalidation fields on writes. Without `cache`, those options are omitted from the type (see [Cache](./cache.md#typescript-dx)).

```typescript
@Module({
  controllers: [ProductController],
  providers: [ProductService, ProductRepository],
  exports: [ProductService, ProductRepository],
})
export class ProductModule {}
```

Inject like any Nest provider:

```typescript
constructor(private readonly products: ProductRepository) {}
```

Alias: `createPrismaRepository` === `createInjectableRepository`.

## What the module provides

| Token / provider | For |
|------------------|-----|
| `TransactionService` | Feature transactions |
| `RepositoryRegistry` | Auto-compose registration |
| `AutoComposer` | Relation loading |
| `PRISMAKIT_PRISMA` | **Repositories only** — do not inject in services |
| `PRISMAKIT_CACHE` | Optional cache adapter |
| `PRISMAKIT_OPTIONS` | Module options |

## Transactions

```typescript
import { TransactionService } from '@prismakit/nestjs';

constructor(
  private readonly tx: TransactionService,
  private readonly products: ProductRepository,
) {}

await this.tx.execTx(
  async (tx) => {
    await this.products.updateById({
      tx,
      id,
      data: { stock: { decrement: 1 } },
      invalidate: 'none',
    });
  },
  async () => {
    await this.products.invalidateCache({ id });
  },
);
```

Full pattern: [Transactions](transactions.md).

## ESLint

Always enable `@prismakit/eslint-plugin` so services cannot inject Prisma directly.

See [ESLint reference](../reference/eslint.md).
