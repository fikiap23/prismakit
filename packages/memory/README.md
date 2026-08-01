# @prismakit/memory

In-memory `CacheAdapter` for tests and local development without Redis.

```bash
pnpm add @prismakit/memory
```

```typescript
import { MemoryCacheAdapter } from '@prismakit/memory';

const cache = new MemoryCacheAdapter({ maxSize: 1000, defaultTtl: 300 });
```

Pass `cache` to `createRepository` deps or `PrismaKitModule.forRoot({ cache })`.

## License

Apache-2.0
