# @prismakit/redis

Redis `CacheAdapter` for `@prismakit/core` repositories (ioredis).

Fail-open: cache errors do not break reads/writes.

## Install

```bash
pnpm add @prismakit/redis ioredis
```

## Usage

```typescript
import { RedisCacheAdapter } from '@prismakit/redis';

const cache = new RedisCacheAdapter({
  prefix: 'myapp',
  // url / client options — see RedisCacheAdapter options
});
```

Pass `cache` into `createRepository` deps, or into `PrismaKitModule.forRoot({ cache })` when using NestJS.

## Docs

- [GitHub README](https://github.com/fikiap23/prismakit#readme)
- [Cache guide](https://github.com/fikiap23/prismakit/blob/master/docs/CACHE.md)

## License

Apache-2.0
