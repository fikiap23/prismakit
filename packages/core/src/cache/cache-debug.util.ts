import { AsyncLocalStorage } from 'async_hooks';

export type CacheDebugStatus = 'HIT' | 'MISS' | 'BYPASS' | 'SKIP';

export const cacheDebugStorage = new AsyncLocalStorage<{
  status?: CacheDebugStatus;
}>();

export function isCacheDebugEnabled(): boolean {
  return process.env.CACHE_DEBUG === 'true';
}

export function recordCacheDebug(
  method: string,
  status: CacheDebugStatus,
  detail?: string,
): void {
  if (!isCacheDebugEnabled()) return;

  const store = cacheDebugStorage.getStore();
  if (store) {
    store.status = status;
  }

  const suffix = detail ? ` (${detail})` : '';
  console.debug(`[CacheDebug] ${method} ${status}${suffix}`);
}
