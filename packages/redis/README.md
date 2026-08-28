# @prismakit/redis

Redis `CacheAdapter` for `@prismakit/core` repositories (ioredis).

Fail-open: cache errors do not break reads/writes.

**Status:** pre-stable (4.0).

[Documentation](https://github.com/fikiap23/prismakit/blob/master/docs/README.md) · [Cache guide](https://github.com/fikiap23/prismakit/blob/master/docs/guide/cache.md) · [GitHub](https://github.com/fikiap23/prismakit)

## Install

```bash
pnpm add @prismakit/redis ioredis
```

## Usage

```typescript
import { Prisma } from '@prisma/client';
import { RedisCacheAdapter } from '@prismakit/redis';

const cache = new RedisCacheAdapter({
  url: process.env.REDIS_URL, // or host + port
  prefix: 'myapp',
  decimalFactory: (s) => new Prisma.Decimal(s),
});
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `url` | — | Redis connection URL |
| `host` | `localhost` | Used when `url` is omitted |
| `port` | `6379` | Used when `url` is omitted |
| `prefix` | `prismakit` | Key prefix for all cache keys |
| `decimalFactory` | keep string | `(s) => new Prisma.Decimal(s)` so Decimal matches native Prisma |

### Wire it up

**Core**

```typescript
const users = new UserRepository({ prisma, cache });
```

**NestJS**

```typescript
PrismaKitModule.forRoot({
  prisma,
  cache: new RedisCacheAdapter({ prefix: 'myapp' }),
});
```

### JSON codec

Tagged JSON for `Date`, `BigInt`, `Bytes`, and Prisma `Decimal`. Pass `decimalFactory` so cache hits and AutoComposer clones return native Prisma scalars (`Date` / `Decimal`), not strings from `toJSON`.

Cache debug (`CACHE_DEBUG=true`, `cacheDebugStorage`, …) lives on `@prismakit/core`.

## Cache behavior (reminder)

- Reads cache only when `setCache: true`
- Never cache auth / sensitive selects
- Inside transactions: skip cache; invalidate in `afterCommit`

## Docs

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [Cache guide](https://github.com/fikiap23/prismakit/blob/master/docs/guide/cache.md)

## License

Apache-2.0
