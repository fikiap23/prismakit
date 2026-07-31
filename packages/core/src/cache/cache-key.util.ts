import { stableHash } from './stable-hash.util';

export function buildEntityKey(opts: {
  prefix: string;
  model: string;
  id: string;
  method: string;
  select?: object;
}): string {
  const selectHash = stableHash(opts.select ?? {});
  return `${opts.prefix}:repo:${opts.model}:e:${opts.id}:${opts.method}:${selectHash}`;
}

export function buildQueryKey(opts: {
  prefix: string;
  model: string;
  method: string;
  params: Record<string, unknown>;
}): string {
  const queryHash = stableHash(opts.params);
  return `${opts.prefix}:repo:${opts.model}:q:${opts.method}:${queryHash}`;
}

export function entityIndexKey(
  prefix: string,
  model: string,
  id: string,
): string {
  return `${prefix}:repo:${model}:e:${id}:__idx`;
}

export function queryIndexKey(prefix: string, model: string): string {
  return `${prefix}:repo:${model}:q:__idx`;
}
