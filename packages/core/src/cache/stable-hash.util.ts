/**
 * Fast non-cryptographic hash for cache keys (FNV-1a 64-bit → hex).
 * Replaces SHA-256: ~10× faster for small JSON payloads; not for security.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/**
 * WeakMap cache: object identity → hash string. Only used for **frozen**
 * objects — a mutable `select` / `where` reused and then mutated would keep its
 * old hash and read another query's cache entry (wrong shape / wrong rows).
 */
const hashCache = new WeakMap<object, string>();

function isCacheable(obj: unknown): obj is object {
  return obj !== null && typeof obj === 'object' && Object.isFrozen(obj);
}

function sortDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return { __bigint: value.toString() };
  if (Array.isArray(value)) return value.map(sortDeep);
  if (typeof value === 'object' && value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * FNV_PRIME);
  }
  return hash.toString(16).padStart(16, '0');
}

export function stableHash(obj: unknown): string {
  const cacheable = isCacheable(obj);
  if (cacheable) {
    const cached = hashCache.get(obj);
    if (cached) return cached;
  }

  const normalized = sortDeep(obj);
  const hash = fnv1a64(JSON.stringify(normalized));

  if (cacheable) hashCache.set(obj, hash);
  return hash;
}

/**
 * Pre-compute and cache hash for a select preset. Freezes `select` (deeply) so
 * the cached hash can never go stale.
 */
export function precomputeSelectHash(select: object): string {
  deepFreeze(select);
  return stableHash(select);
}

function deepFreeze(value: object): void {
  if (Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child);
  }
}
