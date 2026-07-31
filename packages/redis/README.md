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

- [Documentation index](https://github.com/fikiap23/prismakit/blob/master/docs/README.md)
- [Cache guide](https://github.com/fikiap23/prismakit/blob/master/docs/guide/cache.md)


## License

Apache-2.0
