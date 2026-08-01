# Migration from TypeORM

Map TypeORM’s repository / `EntityManager` patterns onto PrismaKit’s `createRepository` / Nest injectable repos and `TransactionService.execTx`.

## Package mapping

| TypeORM | PrismaKit |
|---------|-----------|
| `@Entity()` + DataSource | Prisma schema + `PrismaClient` |
| `Repository<User>` / custom repo class | `createRepository` / `createInjectableRepository` / `defineAppRepo` |
| `EntityManager` / `QueryRunner` transactions | `TransactionService.execTx` (Nest) or Prisma `$transaction` only inside infrastructure |
| `@Cache` / Redis DIY | `cache` on repository + `CacheAdapter` |
| `find({ relations })` | Select presets + auto-compose |
| Soft delete (`@DeleteDateColumn`) | `deletedAt` field + where filters / shared soft-delete helper |

## 1. Replace TypeORM repositories

**Before (TypeORM)**

```typescript
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findOne(id: string) {
    return this.users.findOne({ where: { id }, relations: ['role'] });
  }
}
```

**After (PrismaKit Nest)**

```typescript
export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
});

@Injectable()
export class UserService {
  constructor(private readonly users: UserRepository) {}

  handleGetById(id: string) {
    return this.users.getThrowById({
      id,
      select: {
        id: true,
        email: true,
        role: { select: { id: true, code: true } },
      },
      setCache: true,
    });
  }
}
```

Plain Node without Nest:

```typescript
const UserRepository = createRepository({
  model: 'user',
  scalarFields: Prisma.UserScalarFieldEnum,
  cache: { ttl: 86400 },
});
const users = new UserRepository({ prisma, cache });
```

## 2. Transactions: EntityManager → `execTx`

**Before**

```typescript
await this.dataSource.transaction(async (manager) => {
  await manager.save(order);
  await manager.decrement(Stock, { id: stockId }, 'qty', 1);
});
```

**After**

```typescript
await this.prismaTx.execTx(
  async (tx) => {
    await this.orders.create({ tx, data: orderData, invalidate: 'none' });
    await this.stocks.updateById({
      tx,
      id: stockId,
      data: { qty: { decrement: 1 } },
      invalidate: 'none',
    });
  },
  async () => {
    await this.orders.invalidateCache({});
    await this.stocks.invalidateCache({ id: stockId });
  },
);
```

Do not inject `PrismaService` into feature services for `$transaction` — use `TransactionService` so after-commit invalidation stays consistent.

## 3. Soft delete

TypeORM’s `@DeleteDateColumn` becomes an explicit nullable `deletedAt` (or similar) on the Prisma model.

Patterns that work well with PrismaKit:

1. **Filter in where builders** — always add `deletedAt: null` for public lists.
2. **Soft-delete helper** — shared helper that sets `deletedAt: new Date()` via `updateById` instead of `deleteById`.
3. **Hard delete** — keep `deleteById` for admin/cleanup paths only.

```typescript
await this.users.updateById({
  id,
  data: { deletedAt: new Date() },
});
```

Cascade: prefer Prisma `onDelete` in the schema for DB-level cascades. For application-level cascades, run related updates inside one `execTx` with `invalidate: 'none'` and invalidate each affected model in `afterCommit`.

## 4. Cascades and “in use” guards

TypeORM cascade options on relations often hide deletes. With PrismaKit:

- Load `_count` (or related FKs) through the repository select.
- Throw a business error if children exist (shared resource-in-use helper).
- Or delete children in the same `execTx`.

## 5. Checklist

- [ ] Prisma schema covers former entities; migrate data once
- [ ] One PrismaKit repository per model (cache registered in `cacheModels` when used)
- [ ] Services only call repositories / helpers
- [ ] Transactions via `execTx` + `afterCommit` invalidation
- [ ] Soft deletes are explicit fields + where filters
- [ ] `@prismakit/eslint-plugin` recommended config enabled

See also: [Getting started](../getting-started.md) · [Transactions](./transactions.md) · [Repository](./repository.md)
