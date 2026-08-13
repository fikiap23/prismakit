# Telemetry & query logging

PrismaKit can emit structured events for cache, compose, locks, stampede, and queries.

## Core

```typescript
import { setTelemetry } from '@prismakit/core';

setTelemetry({
  enabled: true,
  slowThreshold: 500,
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
    slowThreshold: 500,
    onSlowQuery: (e) =>
      logger.warn(`Slow ${e.model}.${e.method}: ${e.durationMs}ms`),
    onEvent: (e) => metrics.record(e),
  },
});
```

`slowThreshold` / `onSlowQuery` enable telemetry (unless `enabled: false`) and emit `query.slow` for slow repository methods.

In 3.x this lived under a separate `queryLog` option — fold those fields into `telemetry` when upgrading. See [Upgrade to 4.0](./migration-to-4.md).

## OpenTelemetry

```bash
pnpm add @prismakit/opentelemetry @opentelemetry/api
```

```typescript
import { createPrismaKitTelemetry } from '@prismakit/opentelemetry';

PrismaKitModule.forRoot({
  prisma,
  cache,
  telemetry: createPrismaKitTelemetry({ slowThreshold: 500 }),
});
```

See the package README for metric names. Bring your own OTel SDK — the adapter only uses `@opentelemetry/api`.

## Production

Full ops checklist: [Production guide](production.md).
