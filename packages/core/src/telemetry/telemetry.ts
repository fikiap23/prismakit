/**
 * Built-in telemetry for PrismaKit — cache, compose, lock, stampede events.
 * Consumers wire `onEvent` via module options or `setTelemetry`.
 */

export type CacheTelemetryEvent = {
  type:
    | 'cache.hit'
    | 'cache.miss'
    | 'cache.bypass'
    | 'cache.invalidate'
    | 'cache.error';
  model?: string;
  method?: string;
  detail?: string;
  durationMs?: number;
  error?: unknown;
};

export type ComposeTelemetryEvent = {
  type: 'compose.start' | 'compose.complete';
  model: string;
  depth?: number;
  relationCount?: number;
  queryCount?: number;
  durationMs?: number;
};

export type LockTelemetryEvent = {
  type: 'lock.acquired' | 'lock.waited' | 'lock.timeout';
  model?: string;
  mode?: string;
  durationMs?: number;
};

export type StampedeTelemetryEvent = {
  type: 'stampede.locked' | 'stampede.waited' | 'stampede.fallthrough';
  model?: string;
  key?: string;
  retries?: number;
  durationMs?: number;
};

export type QueryTelemetryEvent = {
  type: 'query.slow' | 'query.complete';
  model?: string;
  method?: string;
  durationMs: number;
  thresholdMs?: number;
};

export type TelemetryEvent =
  | CacheTelemetryEvent
  | ComposeTelemetryEvent
  | LockTelemetryEvent
  | StampedeTelemetryEvent
  | QueryTelemetryEvent;

export type TelemetryHandler = (event: TelemetryEvent) => void;

export type TelemetryOptions = {
  enabled?: boolean;
  onEvent?: TelemetryHandler;
  /**
   * When set, repository queries that take at least this many ms also emit
   * `query.slow` (in addition to `query.complete`).
   */
  slowThreshold?: number;
};

let handler: TelemetryHandler | undefined;
let enabled = false;
let slowThresholdMs: number | undefined;

export function setTelemetry(options: TelemetryOptions | undefined): void {
  enabled = options?.enabled === true;
  handler = options?.onEvent;
  slowThresholdMs =
    typeof options?.slowThreshold === 'number' && options.slowThreshold > 0
      ? options.slowThreshold
      : undefined;
}

export function getTelemetryEnabled(): boolean {
  return enabled && !!handler;
}

export function getTelemetrySlowThreshold(): number | undefined {
  return slowThresholdMs;
}

export function emitTelemetry(event: TelemetryEvent): void {
  if (!enabled || !handler) return;
  try {
    handler(event);
  } catch (err) {
    console.warn('[PrismaKit telemetry] handler error', (err as Error).message);
  }
}
