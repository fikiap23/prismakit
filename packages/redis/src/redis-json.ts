const BIGINT_TAG = '__bigint';

/** JSON.stringify replacer — Prisma `BigInt` fields are not JSON-serializable by default. */
export function redisJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { [BIGINT_TAG]: value.toString() };
  }
  return value;
}

/** JSON.parse reviver — restore tagged BigInt payloads from {@link redisJsonReplacer}. */
export function redisJsonReviver(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    BIGINT_TAG in value
  ) {
    const raw = (value as Record<string, unknown>)[BIGINT_TAG];
    if (typeof raw === 'string') {
      return BigInt(raw);
    }
  }
  return value;
}

export function redisJsonStringify(value: unknown): string {
  return JSON.stringify(value, redisJsonReplacer);
}

export function redisJsonParse<T>(raw: string): T {
  return JSON.parse(raw, redisJsonReviver) as T;
}
