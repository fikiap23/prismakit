# Telemetry & query logging

PrismaKit can emit structured events for cache, compose, locks, stampede, and queries.

## Core

```typescript
import { setTelemetry } from '@prismakit/core';

setTelemetry({
  enabled: true,
  onEvent: (event) => {
    // Wire to Prometheus / DataDog / OpenTelemetry
    console.debug('[pk]', event.type, event);
  },
});
```

### Event types

| Type | When |
|------|------|
| `cache.hit` / `cache.miss` / `cache.bypass` / `cache.invalidate` | Cache-aside path |
| `compose.start` / `compose.complete` | AutoCompose (includes `queryCount`, `durationMs`) |
| `lock.acquired` / `lock.waited` / `lock.timeout` | Row locks |
| `stampede.locked` / `stampede.waited` / `stampede.fallthrough` | Stampede protection |
| `query.complete` / `query.slow` | Repository method timing |

## NestJS

```typescript
PrismaKitModule.forRoot({
  prisma,
  cache,
  telemetry: {
    enabled: true,
    onEvent: (e) => metrics.record(e),
  },
  queryLog: {
    slowThreshold: 500,
    onSlowQuery: (e) =>
      logger.warn(`Slow ${e.model}.${e.method}: ${e.durationMs}ms`),
  },
});
```

`queryLog` automatically enables telemetry and filters `query.complete` events above the threshold.
