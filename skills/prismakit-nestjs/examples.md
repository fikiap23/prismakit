# PrismaKit NestJS examples

Production-shaped snippets. Contract: skill `prismakit` + [SKILL.md](SKILL.md).

## 1. App module (Redis, allowlist, slow-query log)

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaKitModule } from '@prismakit/nestjs';
import { RedisCacheAdapter } from '@prismakit/redis';
import { PrismaClientModule } from './infrastructure/prisma/prisma-client.module';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { UserModule } from './modules/users/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaClientModule,
    PrismaKitModule.forRootAsync({
      imports: [PrismaClientModule],
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => ({
        prisma,
        cache: new RedisCacheAdapter({
          url: config.get<string>('REDIS_URL'),
          prefix: config.get<string>('CACHE_PREFIX') ?? 'myapp',
        }),
        cacheModels: ['user', 'product', 'wallet'],
        schemaPath: 'prisma/schema.prisma',
        validateCompose: true,
        compose: { maxDepth: 6, parallel: true, setCache: true },
        autoRegisterModels: true,
        queryLog: {
          slowThreshold: 500,
          onSlowQuery: (e) => {
            console.warn(`Slow ${e.model}.${e.method}: ${e.durationMs}ms`);
          },
        },
      }),
    }),
    UserModule,
  ],
})
export class AppModule {}
```

Prisma 5/6: pass `dmmf: Prisma.dmmf` instead of (or in addition to skipping) `schemaPath`. Prisma 7: `schemaPath` only.

## 2. TypeMap binder

```typescript
// src/infrastructure/prisma/define-repo.ts
import { createDefineRepo } from '@prismakit/nestjs';
import type { Prisma } from '@prisma/client';

export const defineRepo = createDefineRepo<Prisma.TypeMap>();
```

## 3. Feature repository + select presets

```typescript
// src/modules/users/repositories/user.repository.ts
import { Prisma } from '@prisma/client';
import { defineRepo } from '../../../infrastructure/prisma/define-repo';

const DAY = 86_400;

export const userSelectPresets = {
  minimal: { id: true } satisfies Prisma.UserSelect,
  general: {
    id: true,
    email: true,
    name: true,
  } satisfies Prisma.UserSelect,
  withPassword: {
    id: true,
    email: true,
    password: true,
  } satisfies Prisma.UserSelect,
};

export const UserRepository = defineRepo({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: {
    ttl: DAY,
    nullTtl: 60,
    sensitiveFields: ['password'],
    methods: { getFirst: { enabled: false } },
  },
  lock: true,
});
export type UserRepository = InstanceType<typeof UserRepository>;
```

## 4. Feature module + thin controller + service

```typescript
// src/modules/users/user.module.ts
import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './repositories/user.repository';

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
```

```typescript
// src/modules/users/user.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.users.getProfile(id);
  }
}
```

```typescript
// src/modules/users/user.service.ts
import { Injectable } from '@nestjs/common';
import { UserRepository, userSelectPresets } from './repositories/user.repository';

@Injectable()
export class UserService {
  constructor(private readonly users: UserRepository) {}

  getProfile(id: string) {
    return this.users.getThrowById({
      id,
      select: userSelectPresets.general,
      setCache: true,
    });
  }

  async assertEmailFree(email: string) {
    const hit = await this.users.getFirst({
      where: { email },
      select: userSelectPresets.minimal,
    });
    if (hit) throw new Error('email taken');
  }
}
```

## 5. Checkout — multi-repo `execTx`

```typescript
@Injectable()
export class CheckoutService {
  constructor(
    private readonly tx: TransactionService,
    private readonly orders: OrderRepository,
    private readonly stocks: StockRepository,
  ) {}

  handleCheckout(input: { stockId: string; qty: number; userId: string }) {
    return this.tx.execTx(
      async (tx) => {
        const order = await this.orders.create({
          tx,
          data: { userId: input.userId, stockId: input.stockId, qty: input.qty },
          select: { id: true },
          invalidate: 'none',
        });
        await this.stocks.updateById({
          tx,
          id: input.stockId,
          data: { qty: { decrement: input.qty } },
          invalidate: 'none',
        });
        return order;
      },
      async () => {
        await this.orders.invalidateCache({});
        await this.stocks.invalidateCache({ id: input.stockId });
      },
    );
  }
}
```

Register `OrderRepository` and `StockRepository` in the feature module `providers`. Both need `cache` config for `invalidate: 'none'` / `invalidateCache` to exist on the type.

## 6. Wallet lock

```typescript
@Injectable()
export class WalletService {
  constructor(
    private readonly tx: TransactionService,
    private readonly wallets: WalletRepository,
  ) {}

  debit(id: string, amount: number) {
    return this.tx.execTx(
      async (tx) => {
        const wallet = await this.wallets.getById({
          tx,
          id,
          select: { id: true, balance: true },
          lock: { mode: 'update' },
        });
        if (!wallet || wallet.balance < amount) {
          throw new Error('insufficient funds');
        }
        return this.wallets.updateById({
          tx,
          id,
          data: { balance: wallet.balance - amount },
          select: { id: true, balance: true },
          invalidate: 'none',
        });
      },
      async () => {
        await this.wallets.invalidateCache({ id });
      },
    );
  }
}
```

`WalletRepository` must set `lock: true` (or a table/client key). Never call `lock` outside `execTx`.
