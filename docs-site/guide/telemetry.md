# Telemetry

Emit structured events for cache, compose, locks, stampede, and queries.

```typescript
setTelemetry({
  enabled: true,
  slowThreshold: 500,
  onEvent: (e) => console.debug(e.type, e),
});
```

Nest: pass `telemetry` and/or `queryLog` on `PrismaKitModule.forRoot`.

## OpenTelemetry

```bash
pnpm add @prismakit/opentelemetry @opentelemetry/api
```

```typescript
import { createPrismaKitTelemetry } from '@prismakit/opentelemetry';

telemetry: createPrismaKitTelemetry({ slowThreshold: 500 }),
```

Full event table: [docs/guide/telemetry.md](https://github.com/fikiap23/prismakit/blob/master/docs/guide/telemetry.md)
