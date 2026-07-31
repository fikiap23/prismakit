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
      cacheModels: ['user', 'product'],
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
| `cacheModels` | no | Strict allowlist of model keys with `cache` config. Omit = fail-open |
| `schemaPath` | no | Path to `prisma/schema.prisma` for lock helpers |
| `validateCompose` | no | When `true`, run compose validation on module init |

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
    cacheModels: ['user'],
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

Register the returned class in a feature module `providers`. Never inject `prisma` into services.

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
