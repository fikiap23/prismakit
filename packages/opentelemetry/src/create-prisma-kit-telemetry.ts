import {
  metrics,
  trace,
  SpanStatusCode,
  type Meter,
  type Tracer,
  type Counter,
  type Histogram,
} from '@opentelemetry/api';
import type { TelemetryEvent, TelemetryOptions } from '@prismakit/core';

export type CreatePrismaKitTelemetryOptions = {
  /** Defaults to `trace.getTracer('prismakit')`. */
  tracer?: Tracer;
  /** Defaults to `metrics.getMeter('prismakit')`. */
  meter?: Meter;
  /** Instrument name prefix. Default `prismakit`. */
  prefix?: string;
  /**
   * When set, also enable core `query.slow` emission at this threshold (ms).
   * Nest `queryLog.slowThreshold` remains the preferred Nest path.
   */
  slowThreshold?: number;
};

type Instruments = {
  cache: Counter;
  compose: Histogram;
  query: Histogram;
  lock: Histogram;
  stampede: Counter;
};

function createInstruments(meter: Meter, prefix: string): Instruments {
  return {
    cache: meter.createCounter(`${prefix}.cache`, {
      description: 'PrismaKit cache events',
    }),
    compose: meter.createHistogram(`${prefix}.compose.duration`, {
      description: 'PrismaKit auto-compose duration (ms)',
      unit: 'ms',
    }),
    query: meter.createHistogram(`${prefix}.query.duration`, {
      description: 'PrismaKit repository query duration (ms)',
      unit: 'ms',
    }),
    lock: meter.createHistogram(`${prefix}.lock.duration`, {
      description: 'PrismaKit row-lock duration (ms)',
      unit: 'ms',
    }),
    stampede: meter.createCounter(`${prefix}.stampede`, {
      description: 'PrismaKit stampede protection events',
    }),
  };
}

/**
 * Build {@link TelemetryOptions} that map PrismaKit events to OpenTelemetry
 * metrics (and short spans for compose / slow queries).
 *
 * Bring your own OTel SDK — this package only depends on `@opentelemetry/api`.
 *
 * @example
 * ```ts
 * import { createPrismaKitTelemetry } from '@prismakit/opentelemetry';
 *
 * PrismaKitModule.forRoot({
 *   prisma,
 *   cache,
 *   telemetry: createPrismaKitTelemetry({ slowThreshold: 500 }),
 * });
 * ```
 */
export function createPrismaKitTelemetry(
  options: CreatePrismaKitTelemetryOptions = {},
): TelemetryOptions {
  const prefix = options.prefix ?? 'prismakit';
  const tracer = options.tracer ?? trace.getTracer(prefix);
  const meter = options.meter ?? metrics.getMeter(prefix);
  const instruments = createInstruments(meter, prefix);

  return {
    enabled: true,
    slowThreshold: options.slowThreshold,
    onEvent: (event: TelemetryEvent) => {
      const model = event.model ?? 'unknown';
      const method = 'method' in event ? (event.method ?? 'unknown') : 'unknown';

      switch (event.type) {
        case 'cache.hit':
        case 'cache.miss':
        case 'cache.bypass':
        case 'cache.invalidate':
        case 'cache.error':
          instruments.cache.add(1, {
            outcome: event.type.replace('cache.', ''),
            model,
            method,
          });
          break;

        case 'compose.start': {
          const span = tracer.startSpan('prismakit.compose', {
            attributes: {
              'prismakit.model': event.model,
              'prismakit.depth': event.depth ?? 0,
              'prismakit.relation_count': event.relationCount ?? 0,
            },
          });
          span.end();
          break;
        }
        case 'compose.complete':
          instruments.compose.record(event.durationMs ?? 0, {
            model: event.model,
            query_count: String(event.queryCount ?? 0),
          });
          break;

        case 'query.complete':
        case 'query.slow':
          instruments.query.record(event.durationMs, {
            model,
            method,
            slow: String(event.type === 'query.slow'),
          });
          if (event.type === 'query.slow') {
            const span = tracer.startSpan('prismakit.query.slow', {
              attributes: {
                'prismakit.model': model,
                'prismakit.method': method,
                'prismakit.duration_ms': event.durationMs,
                'prismakit.threshold_ms': event.thresholdMs ?? 0,
              },
            });
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'slow query' });
            span.end();
          }
          break;

        case 'lock.acquired':
        case 'lock.waited':
        case 'lock.timeout':
          instruments.lock.record(event.durationMs ?? 0, {
            outcome: event.type.replace('lock.', ''),
            model,
            mode: event.mode ?? 'unknown',
          });
          break;

        case 'stampede.locked':
        case 'stampede.waited':
        case 'stampede.fallthrough':
          instruments.stampede.add(1, {
            outcome: event.type.replace('stampede.', ''),
            model,
          });
          break;
      }
    },
  };
}
