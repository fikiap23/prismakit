# Aggregations and counts

PrismaKit exposes Prisma aggregate delegates on repositories with the same cache and `tx` rules as reads.

## `count`

```typescript
const { count } = await repo.count({
  where: { status: 'ACTIVE' },
  setCache: true, // optional when repo has cache
});
```

Returns `{ count: number }` (Prisma shape).

## `exists`

Boolean helper over `count({ take: 1 })`:

```typescript
const { exists } = await repo.exists({
  where: { email },
  // do not setCache on auth / uniqueness checks
});
```

## `aggregate`

Pass Prisma `aggregate` args (`_count`, `_sum`, `_avg`, …):

```typescript
const stats = await repo.aggregate({
  where: { categoryId },
  _count: { _all: true },
  _sum: { price: true },
  setCache: true,
});
```

## `groupBy`

```typescript
const rows = await repo.groupBy({
  by: ['status'],
  where: { createdAt: { gte: since } },
  _count: { _all: true },
  orderBy: { status: 'asc' },
});
```

## Caching

`count`, `exists`, `aggregate`, and `groupBy` support `setCache` / `cacheTags` when the repository has `cache` config and the call is outside a transaction. Prefer short TTLs or tags for aggregate query caches.

See [Cache](./cache.md) and [Repository](./repository.md).
