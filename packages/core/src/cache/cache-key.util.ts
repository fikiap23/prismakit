import { stableHash } from './stable-hash.util';

/**
 * Cache key format version. Bump when the on-wire payload codec changes
 * (e.g. Date/Decimal/Bytes tags) so legacy entries miss instead of deserializing wrong.
 */
export const CACHE_KEY_VERSION = 'v2';

export function buildEntityKey(opts: {
  prefix: string;
  model: string;
  id: string;
  method: string;
  select?: object;
}): string {
  const selectHash = stableHash(opts.select ?? {});
  return `${opts.prefix}:${CACHE_KEY_VERSION}:repo:${opts.model}:e:${opts.id}:${opts.method}:${selectHash}`;
}

export function buildQueryKey(opts: {
  prefix: string;
  model: string;
  method: string;
  params: Record<string, unknown>;
}): string {
  const queryHash = stableHash(opts.params);
  return `${opts.prefix}:${CACHE_KEY_VERSION}:repo:${opts.model}:q:${opts.method}:${queryHash}`;
}

export function entityIndexKey(
  prefix: string,
  model: string,
  id: string,
): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:e:${id}:__idx`;
}

/** Tracks all per-id entity index keys for a model (used by invalidate:'all'). */
export function entityAllIndexKey(prefix: string, model: string): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:e:__idx`;
}

export function queryIndexKey(prefix: string, model: string): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:q:__idx`;
}

export function tagIndexKey(
  prefix: string,
  model: string,
  tag: string,
): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:t:${tag}:__idx`;
}
