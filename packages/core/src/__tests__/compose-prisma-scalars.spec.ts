import { afterEach, describe, expect, it } from 'vitest';
import { setTaggedJsonOptions } from '../codec/tagged-json';
import { resetGlobals, setupSimpleWorld } from './helpers/setup';

class Decimal {
  constructor(private readonly value: string) {}
  toFixed(): string {
    return this.value;
  }
  toJSON(): string {
    return this.value;
  }
}

describe('compose clone keeps Prisma Date / Decimal', () => {
  afterEach(() => {
    resetGlobals();
  });

  it('returns Date and Decimal after composing a nested relation', async () => {
    const placedAt = new Date('2026-08-28T04:42:00.000Z');
    const { repos } = setupSimpleWorld({
      models: {
        user: {
          rows: [
            {
              id: 'u1',
              name: 'Ada',
              createdAt: placedAt,
              balance: new Decimal('12.50'),
            },
          ],
        },
        post: {
          rows: [{ id: 'p1', title: 'Hello', authorId: 'u1' }],
        },
      },
    });
    setTaggedJsonOptions({ decimalFactory: (s) => new Decimal(s) });

    const row = await repos.user.getById({
      id: 'u1',
      select: {
        id: true,
        createdAt: true,
        balance: true,
        posts: { select: { id: true, title: true } },
      },
    });

    expect(row.posts).toMatchObject([{ id: 'p1', title: 'Hello' }]);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.createdAt.getTime()).toBe(placedAt.getTime());
    expect(row.balance).toBeInstanceOf(Decimal);
    expect(row.balance.toFixed()).toBe('12.50');
  });
});
