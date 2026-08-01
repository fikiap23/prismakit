export {
  RedisCacheAdapter,
  type RedisCacheAdapterOptions,
  type RedisCompression,
} from './redis-cache-adapter';

export {
  redisJsonParse,
  redisJsonStringify,
  redisJsonReplacer,
  redisJsonReviver,
} from './redis-json';

/** Re-export cache debug helpers from core — do not duplicate. */
export {
  type CacheDebugStatus,
  cacheDebugStorage,
  isCacheDebugEnabled,
  recordCacheDebug,
} from '@prismakit/core';

export type { CacheAdapter } from '@prismakit/core';
