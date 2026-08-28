import { afterEach, describe, expect, it } from 'vitest';
import {
  cloneWithCodec,
  setTaggedJsonOptions,
  taggedJsonParse,
  taggedJsonStringify,
} from '../codec/tagged-json';

/** Mimics Prisma.Decimal: toJSON returns a string so naive JSON.stringify loses the class. */
class Decimal {
  constructor(private readonly value: string) {}
  toFixed(): string {
    return this.value;
  }
  toJSON(): string {
    return this.value;
  }
}

afterEach(() => {
  setTaggedJsonOptions(undefined);
});

describe('taggedJsonStringify / parse', () => {
  it('round-trips Date despite Date#toJSON (naive replacer cannot see Date)', () => {
    const createdAt = new Date('2026-08-28T04:42:00.000Z');
    const naive = JSON.stringify({ createdAt }, (_k, v) =>
      v instanceof Date ? { __date: v.toISOString() } : v,
    );
    expect(JSON.parse(naive).createdAt).toBe('2026-08-28T04:42:00.000Z');

    const raw = taggedJsonStringify({ createdAt });
    expect(raw).toContain('__date');
    const parsed = taggedJsonParse<{ createdAt: Date }>(raw);
    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.createdAt.toISOString()).toBe('2026-08-28T04:42:00.000Z');
    expect(typeof parsed.createdAt.getTime).toBe('function');
  });

  it('round-trips Prisma-like Decimal when decimalFactory is set', () => {
    const price = new Decimal('12.50');
    const raw = taggedJsonStringify({ price });
    expect(raw).toContain('__decimal');
    const parsed = taggedJsonParse<{ price: Decimal }>(raw, {
      decimalFactory: (s) => new Decimal(s),
    });
    expect(parsed.price).toBeInstanceOf(Decimal);
    expect(parsed.price.toFixed()).toBe('12.50');
  });

  it('round-trips BigInt and Buffer', () => {
    const blob = Buffer.from('hello');
    const parsed = taggedJsonParse<{ qty: bigint; blob: Buffer }>(
      taggedJsonStringify({ qty: 1n, blob }),
    );
    expect(parsed.qty).toBe(1n);
    expect(Buffer.isBuffer(parsed.blob)).toBe(true);
    expect(parsed.blob.toString()).toBe('hello');
  });
});

describe('cloneWithCodec', () => {
  it('keeps Date + Decimal through tagged clone (structuredClone loses Decimal class)', () => {
    setTaggedJsonOptions({ decimalFactory: (s) => new Decimal(s) });
    const placedAt = new Date('2026-08-01T00:00:00.000Z');
    const cloned = cloneWithCodec({
      placedAt,
      grandTotal: new Decimal('85.00'),
    });
    expect(cloned.placedAt).toBeInstanceOf(Date);
    expect(cloned.placedAt.getTime()).toBe(placedAt.getTime());
    expect(cloned.grandTotal).toBeInstanceOf(Decimal);
    expect(cloned.grandTotal.toFixed()).toBe('85.00');
  });
});
