export type StampedeBackoff = 'fixed' | 'exponential';

export type StampedeOptions = {
  /** Redis lock TTL in seconds (default 5). */
  lockTtl?: number;
  /** Base retry wait in ms (default 100). */
  retryMs?: number;
  /** Max retries while waiting for lock holder (default 10). */
  maxRetries?: number;
  /** Backoff strategy (default 'exponential'). */
  backoff?: StampedeBackoff;
  /** Hard cap on total wait time in ms (default 3000). */
  totalTimeoutMs?: number;
};

export const DEFAULT_STAMPEDE_OPTIONS: Required<StampedeOptions> = {
  lockTtl: 5,
  retryMs: 100,
  maxRetries: 10,
  backoff: 'exponential',
  totalTimeoutMs: 3000,
};

export function resolveStampedeOptions(
  overrides?: StampedeOptions,
): Required<StampedeOptions> {
  return { ...DEFAULT_STAMPEDE_OPTIONS, ...overrides };
}

/** Compute wait for retry attempt `i` (0-based) with optional jitter. */
export function stampedeWaitMs(
  opts: Required<StampedeOptions>,
  attempt: number,
): number {
  const base =
    opts.backoff === 'exponential'
      ? opts.retryMs * Math.pow(2, attempt)
      : opts.retryMs;
  const jitter = Math.floor(Math.random() * (opts.retryMs * 0.25));
  return Math.min(base + jitter, opts.totalTimeoutMs);
}
