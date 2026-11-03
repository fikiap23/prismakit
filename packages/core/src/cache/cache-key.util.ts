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

/** Query keys cached without tags (cleared by tag-scoped invalidation). */
export function untaggedQueryIndexKey(prefix: string, model: string): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:q:__untagged_idx`;
}

export function tagIndexKey(
  prefix: string,
  model: string,
  tag: string,
): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:t:${tag}:__idx`;
}

/**
 * Legacy per-model write gate (≤ 4.0.3). No longer armed: gates are now scoped
 * to what was invalidated (see the keys below). Kept for key-schema tooling.
 */
export function writeGateKey(prefix: string, model: string): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:__write_gate`;
}

/**
 * Short TTL keys armed after invalidate. While present, cache SETs for the
 * matching scope are skipped so in-flight reads cannot repopulate stale rows.
 * Scopes: all queries / all entities / one entity / one tag / untagged queries.
 * Gates live under `:g:` so scans of `:e:{id}:` / `:t:{tag}:` only see data.
 */
export function queriesWriteGateKey(prefix: string, model: string): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:g:q`;
}

export function entitiesWriteGateKey(prefix: string, model: string): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:g:e`;
}

/** Write gate for query caches carrying `tag` (tag-scoped invalidation). */
export function tagWriteGateKey(
  prefix: string,
  model: string,
  tag: string,
): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:g:t:${tag}`;
}

/** Write gate for untagged query caches (tag-scoped invalidation). */
export function untaggedQueryWriteGateKey(
  prefix: string,
  model: string,
): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:g:q:untagged`;
}

/** Write gate for one entity's caches. */
export function entityWriteGateKey(
  prefix: string,
  model: string,
  id: string,
): string {
  return `${prefix}:${CACHE_KEY_VERSION}:repo:${model}:g:e:${id}`;
}
