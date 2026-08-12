import { describe, expect, it, vi } from 'vitest';
import { createPrismaKitTelemetry } from '../create-prisma-kit-telemetry';

describe('createPrismaKitTelemetry', () => {
  it('returns enabled telemetry options with onEvent', () => {
    const counterAdd = vi.fn();
    const histRecord = vi.fn();
    const spanEnd = vi.fn();
    const meter = {
      createCounter: () => ({ add: counterAdd }),
      createHistogram: () => ({ record: histRecord }),
    };
    const tracer = {
      startSpan: () => ({
        setStatus: vi.fn(),
        end: spanEnd,
      }),
    };

    const opts = createPrismaKitTelemetry({
      meter: meter as any,
      tracer: tracer as any,
      slowThreshold: 100,
    });

    expect(opts.enabled).toBe(true);
    expect(opts.slowThreshold).toBe(100);
    expect(typeof opts.onEvent).toBe('function');

    opts.onEvent?.({ type: 'cache.hit', model: 'user', method: 'getById' });
    expect(counterAdd).toHaveBeenCalled();

    opts.onEvent?.({
      type: 'query.slow',
      model: 'user',
      method: 'getMany',
      durationMs: 250,
      thresholdMs: 100,
    });
    expect(histRecord).toHaveBeenCalled();
    expect(spanEnd).toHaveBeenCalled();
  });
});
