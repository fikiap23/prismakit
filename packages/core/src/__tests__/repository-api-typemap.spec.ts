import { describe, it, expectTypeOf } from 'vitest';
import type { InvalidateMode } from '../types/cache-options.type';
import type { RowLockOptions } from '../types/row-lock-options.type';
import type { RepositoryApiFromTypeMap } from '../types/repository-api-typemap.type';
import type { RepositoryOf } from '../types/repository-api-typemap.type';

type FakeTypeMap = {
  model: {
    User: {
      payload: {
        scalars: { id: string; email: string };
        objects: {};
        composites: {};
      };
      fields: { id: unknown; email: unknown };
      operations: {
        findUnique: {
          args: { where: { id?: string; email?: string }; select?: object };
          result: unknown;
        };
        findMany: {
          args: {
            where?: { email?: string };
            orderBy?: { email?: 'asc' | 'desc' };
            select?: { id?: true; email?: true };
          };
          result: unknown;
        };
        create: {
          args: { data: { email: string }; select?: object };
          result: unknown;
        };
        createMany: {
          args: {
            data: { email: string } | { email: string }[];
            skipDuplicates?: boolean;
          };
          result: { count: number };
        };
        update: {
          args: { data: { email?: string }; where: { id: string } };
          result: unknown;
        };
        updateMany: {
          args: { data: { email?: string }; where?: { email?: string } };
          result: { count: number };
        };
        upsert: {
          args: {
            where: { id: string };
            create: { email: string };
            update: { email?: string };
          };
          result: unknown;
        };
        delete: { args: { where: { id: string } }; result: unknown };
        deleteMany: {
          args: { where?: { email?: string } };
          result: { count: number };
        };
      };
    };
  };
};

type Cached = RepositoryApiFromTypeMap<FakeTypeMap, 'User', true>;
type Plain = RepositoryApiFromTypeMap<FakeTypeMap, 'User', false>;

describe('RepositoryApiFromTypeMap method surface', () => {
  it('declares all runtime repository methods', () => {
    expectTypeOf<Cached['create']>().toBeFunction();
    expectTypeOf<Cached['createMany']>().toBeFunction();
    expectTypeOf<Cached['getById']>().toBeFunction();
    expectTypeOf<Cached['getThrowById']>().toBeFunction();
    expectTypeOf<Cached['getFirst']>().toBeFunction();
    expectTypeOf<Cached['getMany']>().toBeFunction();
    expectTypeOf<Cached['getManyPaginate']>().toBeFunction();
    expectTypeOf<Cached['updateById']>().toBeFunction();
    expectTypeOf<Cached['updateMany']>().toBeFunction();
    expectTypeOf<Cached['upsert']>().toBeFunction();
    expectTypeOf<Cached['deleteById']>().toBeFunction();
    expectTypeOf<Cached['deleteMany']>().toBeFunction();
    expectTypeOf<Cached['invalidateCache']>().toBeFunction();
  });

  it('types createMany / updateMany / upsert / deleteMany from TypeMap', () => {
    type CreateManyArgs = Parameters<Cached['createMany']>[0];
    expectTypeOf<CreateManyArgs['data']>().toEqualTypeOf<{ email: string }[]>();
    expectTypeOf<CreateManyArgs['skipDuplicates']>().toEqualTypeOf<
      boolean | undefined
    >();

    type UpdateManyArgs = Parameters<Cached['updateMany']>[0];
    expectTypeOf<UpdateManyArgs['data']>().toEqualTypeOf<{ email?: string }>();
    expectTypeOf<UpdateManyArgs['where']>().toMatchTypeOf<{
      email?: string;
    }>();

    type UpsertArgs = Parameters<Cached['upsert']>[0];
    expectTypeOf<UpsertArgs['where']>().toEqualTypeOf<{
      id?: string;
      email?: string;
    }>();
    expectTypeOf<UpsertArgs['create']>().toEqualTypeOf<{ email: string }>();

    type DeleteManyArgs = Parameters<Cached['deleteMany']>[0];
    expectTypeOf<DeleteManyArgs['where']>().toMatchTypeOf<{
      email?: string;
    }>();
  });

  it('accepts lock and orderBy on getFirst and lock on getMany', () => {
    type GetFirstArgs = Parameters<Cached['getFirst']>[0];
    expectTypeOf<GetFirstArgs>().toMatchTypeOf<{
      lock?: RowLockOptions;
      orderBy?: { email?: 'asc' | 'desc' };
    }>();

    type GetManyArgs = Parameters<Cached['getMany']>[0];
    expectTypeOf<GetManyArgs>().toMatchTypeOf<{ lock?: RowLockOptions }>();
  });

  it('accepts composite PK ids', () => {
    type GetByIdArgs = Parameters<Cached['getById']>[0];
    expectTypeOf<GetByIdArgs['id']>().toEqualTypeOf<
      string | Record<string, string>
    >();
  });

  it('gates mutation cache fields behind THasCache', () => {
    type CachedCreateMany = Parameters<Cached['createMany']>[0];
    expectTypeOf<CachedCreateMany>().toMatchTypeOf<{
      invalidate?: InvalidateMode;
    }>();

    type PlainCreateMany = Parameters<Plain['createMany']>[0];
    expectTypeOf<PlainCreateMany>().not.toMatchTypeOf<{
      invalidate?: InvalidateMode;
    }>();
  });

  it('unwraps defineRepo constructors via RepositoryOf', () => {
    type Ctor = new (...args: never[]) => Cached;
    expectTypeOf<RepositoryOf<Ctor>>().toEqualTypeOf<Cached>();
  });
});
