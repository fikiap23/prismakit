# @prismakit/opentelemetry

Map PrismaKit [`TelemetryEvent`](../core) values to **OpenTelemetry** metrics and short spans.

Peer-only: `@opentelemetry/api`. Bring your own SDK (NodeSDK, OTLP exporter, etc.).

## Install

```bash
pnpm add @prismakit/opentelemetry @opentelemetry/api
```

## Usage (NestJS)

```typescript
import { createPrismaKitTelemetry } from '@prismakit/opentelemetry';

PrismaKitModule.forRoot({
  prisma,
  cache,
  telemetry: createPrismaKitTelemetry({ slowThreshold: 500 }),
});
```

## Usage (core)

```typescript
import { setTelemetry } from '@prismakit/core';
import { createPrismaKitTelemetry } from '@prismakit/opentelemetry';

setTelemetry(createPrismaKitTelemetry());
```

## Instruments

| Metric | Kind | Events |
|--------|------|--------|
| `prismakit.cache` | counter | `cache.*` |
| `prismakit.compose.duration` | histogram (ms) | `compose.complete` |
| `prismakit.query.duration` | histogram (ms) | `query.complete` / `query.slow` |
| `prismakit.lock.duration` | histogram (ms) | `lock.*` |
| `prismakit.stampede` | counter | `stampede.*` |

Slow queries also open a `prismakit.query.slow` span.
