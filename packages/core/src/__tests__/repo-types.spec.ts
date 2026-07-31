import { describe, it, expectTypeOf } from 'vitest';
import { createRepository, type RepoPayloadHKT } from '../index';

type FakeSelect = { id?: boolean; email?: boolean; password?: boolean };
type FakePayload<T extends FakeSelect> = (T extends { id: true }
  ? { id: string }
  : {}) &
  (T extends { email: true } ? { email: string } : {}) &
  (T extends { password: true } ? { password: string } : {});

type FakePayloadOf<S> = S extends FakeSelect ? FakePayload<S> : never;

interface FakePayloadHKT extends RepoPayloadHKT {
  type(): FakePayloadOf<this['_select']>;
}

type FakeTypes = {
  select: FakeSelect;
  create: { email: string };
  update: { email?: string };
  where: { id?: string };
  orderBy: { id?: 'asc' | 'desc' };
  payload: FakePayloadHKT;
};

describe('RepoTypes strong payload inference', () => {
  it('infers GetPayload-like result from select', async () => {
    const findUnique = async () => ({ id: '1', email: 'a@b.c' });
    const Repo = createRepository<FakeTypes>({
      model: 'user',
      getDelegate: (c) =>
        ({ findUnique }) as never,
    });
    const repo = new Repo({
      prisma: { user: { findUnique } },
    });

    const row = await repo.getById({
      id: '1',
      select: { id: true, email: true },
    });

    expectTypeOf(row).toEqualTypeOf<{ id: string; email: string } | null>();
    if (row) {
      expectTypeOf(row.id).toEqualTypeOf<string>();
      expectTypeOf(row.email).toEqualTypeOf<string>();
    }
  });
});
