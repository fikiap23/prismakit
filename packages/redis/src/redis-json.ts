const BIGINT_TAG = '__bigint';
const DATE_TAG = '__date';
const BYTES_TAG = '__bytes';
const DECIMAL_TAG = '__decimal';

export type DecimalFactory = (value: string) => unknown;

export type RedisJsonOptions = {
  /**
   * Reconstruct Prisma `Decimal` (or equivalent) from the tagged string.
   * Default keeps the precision-preserving string so values are not silently
   * coerced to numbers.
   *
   * @example
   * decimalFactory: (s) => new Prisma.Decimal(s)
   */
  decimalFactory?: DecimalFactory;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value)
  );
}

function isDecimalLike(value: unknown): value is { toFixed: () => string } {
  return (
    isPlainObject(value) &&
    typeof (value as { constructor?: { name?: string } }).constructor?.name ===
      'string' &&
    ((value as { constructor: { name: string } }).constructor.name ===
      'Decimal' ||
      (typeof (value as { toFixed?: unknown }).toFixed === 'function' &&
        typeof (value as { d?: unknown }).d === 'object'))
  );
}

/** JSON.stringify replacer — Prisma BigInt / Date / Bytes / Decimal. */
export function redisJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { [BIGINT_TAG]: value.toString() };
  }
  if (value instanceof Date) {
    return { [DATE_TAG]: value.toISOString() };
  }
  if (Buffer.isBuffer(value)) {
    return { [BYTES_TAG]: value.toString('base64') };
  }
  if (
    value &&
    typeof value === 'object' &&
    (value as { type?: string }).type === 'Buffer' &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return {
      [BYTES_TAG]: Buffer.from(
        (value as { data: number[] }).data,
      ).toString('base64'),
    };
  }
  if (isDecimalLike(value)) {
    return { [DECIMAL_TAG]: value.toFixed() };
  }
  return value;
}

/** JSON.parse reviver — restore tagged payloads from {@link redisJsonReplacer}. */
export function createRedisJsonReviver(options: RedisJsonOptions = {}) {
  const decimalFactory = options.decimalFactory ?? ((s: string) => s);
  return (_key: string, value: unknown): unknown => {
    if (!isPlainObject(value)) return value;
    const keys = Object.keys(value);
    if (keys.length !== 1) return value;

    if (BIGINT_TAG in value && typeof value[BIGINT_TAG] === 'string') {
      return BigInt(value[BIGINT_TAG] as string);
    }
    if (DATE_TAG in value && typeof value[DATE_TAG] === 'string') {
      return new Date(value[DATE_TAG] as string);
    }
    if (BYTES_TAG in value && typeof value[BYTES_TAG] === 'string') {
      return Buffer.from(value[BYTES_TAG] as string, 'base64');
    }
    if (DECIMAL_TAG in value && typeof value[DECIMAL_TAG] === 'string') {
      return decimalFactory(value[DECIMAL_TAG] as string);
    }
    return value;
  };
}

export function redisJsonStringify(value: unknown): string {
  return JSON.stringify(value, function (key, val) {
    const holder = this as Record<string, unknown>;
    const raw = key === '' ? value : holder[key];
    if (raw instanceof Date) {
      return redisJsonReplacer(key, raw);
    }
    return redisJsonReplacer(key, val);
  });
}

export function redisJsonParse<T>(
  raw: string,
  options?: RedisJsonOptions,
): T {
  return JSON.parse(raw, createRedisJsonReviver(options)) as T;
}

/**
 * Deep clone via structuredClone, falling back to the tagged JSON codec so
 * Date / BigInt / Buffer / Decimal survive (unlike plain JSON.stringify).
 */
export function cloneWithCodec<T>(value: T, options?: RedisJsonOptions): T {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through for non-cloneable values (e.g. Decimal)
    }
  }
  return redisJsonParse(redisJsonStringify(value), options);
}
