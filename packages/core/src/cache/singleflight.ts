/**
 * In-process singleflight: concurrent callers for the same key share one promise.
 * Complements Redis stampede locks for same-process concurrency.
 */

const inflight = new Map<string, Promise<unknown>>();

export async function singleflight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

export function clearSingleflight(): void {
  inflight.clear();
}
