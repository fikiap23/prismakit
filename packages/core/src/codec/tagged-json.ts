const BIGINT_TAG = '__bigint';
const DATE_TAG = '__date';
const BYTES_TAG = '__bytes';
const DECIMAL_TAG = '__decimal';

export type DecimalFactory = (value: string) => unknown;

export type TaggedJsonOptions = {
  /**
   * Reconstruct Prisma `Decimal` (or equivalent) from the tagged string.
   * Default keeps the precision-preserving string.
   *
   * @example
   * decimalFactory: (s) => new Prisma.Decimal(s)
   */
  decimalFactory?: DecimalFactory;
};

let codecOptions: TaggedJsonOptions = {};

/** App-wide codec options (compose clone + Redis). Pass `undefined` to reset. */
export function setTaggedJsonOptions(
  options: TaggedJsonOptions | undefined,
): void {
  codecOptions = options ? { ...options } : {};
}

export function getTaggedJsonOptions(): TaggedJsonOptions {
  return codecOptions;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
  );
}

function isDecimalLike(value: unknown): value is { toFixed: () => string } {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (value instanceof Date) return false;
  const name = (value as { constructor?: { name?: string } }).constructor?.name;
  if (name === 'Decimal') return true;
  return (
    typeof (value as { toFixed?: unknown }).toFixed === 'function' &&
    typeof (value as { d?: unknown }).d === 'object'
  );
}

/** JSON.stringify replacer — Prisma BigInt / Date / Bytes / Decimal. */
export function taggedJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { [BIGINT_TAG]: value.toString() };
  }
  if (value instanceof Date) {
    return { [DATE_TAG]: value.toISOString() };
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
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

/**
 * JSON.stringify calls `Date#toJSON` / `Decimal#toJSON` *before* the replacer,
 * so `value instanceof Date` in a naive replacer never matches. Look at the
 * holder (`this[key]`) for the original value.
 */
export function taggedJsonStringify(value: unknown): string {
  return JSON.stringify(value, function (this: unknown, key, val) {
    const holder = this as Record<string, unknown> | unknown[];
    const raw = key === '' ? value : (holder as Record<string, unknown>)[key];
    if (raw instanceof Date) {
      return taggedJsonReplacer(key, raw);
    }
    if (isDecimalLike(raw)) {
      return taggedJsonReplacer(key, raw);
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
      return taggedJsonReplacer(key, raw);
    }
    return taggedJsonReplacer(key, val);
  });
}

/** JSON.parse reviver — restore tagged payloads from {@link taggedJsonStringify}. */
export function createTaggedJsonReviver(options: TaggedJsonOptions = {}) {
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

export function taggedJsonParse<T>(
  raw: string,
  options?: TaggedJsonOptions,
): T {
  return JSON.parse(
    raw,
    createTaggedJsonReviver(options ?? getTaggedJsonOptions()),
  ) as T;
}

/**
 * Deep clone that keeps Date / BigInt / Buffer / Decimal like Prisma payloads.
 * Always uses tagged JSON — `structuredClone` turns Prisma Decimal into a
 * plain object (or throws), and `JSON.stringify` alone loses Date via toJSON.
 */
export function cloneWithCodec<T>(value: T, options?: TaggedJsonOptions): T {
  if (value === null || value === undefined) return value;
  return taggedJsonParse(taggedJsonStringify(value), options);
}
