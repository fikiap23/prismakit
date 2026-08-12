/**
 * Built-in telemetry for PrismaKit — cache, compose, lock, stampede events.
 * Consumers wire `onEvent` via module options or `setTelemetryHandler`.
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
};

let handler: TelemetryHandler | undefined;
let enabled = false;

export function setTelemetry(options: TelemetryOptions | undefined): void {
  enabled = options?.enabled === true;
  handler = options?.onEvent;
}

export function getTelemetryEnabled(): boolean {
  return enabled && !!handler;
}

export function emitTelemetry(event: TelemetryEvent): void {
  if (!enabled || !handler) return;
  try {
    handler(event);
  } catch (err) {
    console.warn('[PrismaKit telemetry] handler error', (err as Error).message);
  }
}
