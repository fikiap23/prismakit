import { describe, it, expectTypeOf } from 'vitest';
import type {
  HasCacheFromOptions,
  RepositoryApiFromTypeMap,
} from '../index';

type FakeTypeMap = {
  model: {
    User: {
      payload: { scalars: { id: string; email: string }; objects: {}; composites: {} };
      fields: { id: unknown; email: unknown };
      operations: {
        findUnique: { args: unknown; result: unknown };
        findUniqueOrThrow: { args: unknown; result: unknown };
        findFirst: { args: unknown; result: unknown };
        findMany: { args: unknown; result: unknown };
        create: { args: unknown; result: unknown };
        update: { args: unknown; result: unknown };
        delete: { args: unknown; result: unknown };
      };
    };
  };
};

describe('HasCacheFromOptions', () => {
  it('is true when cache config is present', () => {
    expectTypeOf<
      HasCacheFromOptions<{ model: 'user'; cache: { ttl: 60 } }>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      HasCacheFromOptions<{ model: 'user'; cache: true }>
    >().toEqualTypeOf<true>();
  });

  it('is false when cache is omitted', () => {
    expectTypeOf<
      HasCacheFromOptions<{ model: 'user' }>
    >().toEqualTypeOf<false>();
  });
});

describe('RepositoryApiFromTypeMap cache gating', () => {
  type Cached = RepositoryApiFromTypeMap<FakeTypeMap, 'User', true>;
  type Plain = RepositoryApiFromTypeMap<FakeTypeMap, 'User', false>;

  it('exposes setCache on cached repos', () => {
    type PaginateArgs = Parameters<Cached['getManyPaginate']>[0];
    expectTypeOf<PaginateArgs>().toMatchTypeOf<{ setCache?: boolean }>();
    expectTypeOf<Cached['invalidateCache']>().toBeFunction();
  });

  it('omits setCache on plain repos', () => {
    type PaginateArgs = Parameters<Plain['getManyPaginate']>[0];
    // @ts-expect-error setCache is not on plain repo paginate args
    type _NoSetCache = PaginateArgs['setCache'];
    expectTypeOf<PaginateArgs>().not.toMatchTypeOf<{ setCache?: boolean }>();
    // @ts-expect-error invalidateCache only on cached repos
    type _NoInvalidate = Plain['invalidateCache'];
  });
});
