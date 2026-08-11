import { describe, it, expectTypeOf } from 'vitest';
import { createDefineRepo } from '../create-define-repo';

type FakeTypeMap = {
  model: {
    CartItem: {
      payload: {
        name: 'CartItem';
        scalars: {
          userId: string;
          productId: string;
          qty: number;
        };
        objects: {
          product: {
            name: 'Product';
            scalars: { id: string; sku: string; priceCents: number };
            objects: {};
            composites: {};
          };
        };
        composites: {};
      };
      fields: {};
      operations: {
        findMany: {
          args: {
            where?: { userId?: string };
            select?: {
              userId?: true;
              productId?: true;
              qty?: true;
              product?: { select: { id?: true; sku?: true; priceCents?: true } };
            };
          };
          result: unknown;
        };
        create: { args: { data: { userId: string } }; result: unknown };
        update: { args: { data: { qty?: number } }; result: unknown };
        findUnique: {
          args: { where: { userId_productId?: { userId: string } } };
          result: unknown;
        };
      };
    };
    AuditLog: {
      payload: {
        name: 'AuditLog';
        scalars: { id: string };
        objects: {};
        composites: {};
      };
      fields: {};
      operations: {
        findMany: {
          args: { select?: { id?: true } };
          result: unknown;
        };
        create: { args: { data: { id: string } }; result: unknown };
        update: { args: { data: { id?: string } }; result: unknown };
        findUnique: { args: { where: { id?: string } }; result: unknown };
      };
    };
  };
};

const defineRepo = createDefineRepo<FakeTypeMap>();

class CartItemRepository extends defineRepo({
  model: 'cartItem',
  cache: { ttl: 300 },
  primaryKey: ['userId', 'productId'],
}) {}

class AuditLogRepository extends defineRepo({
  model: 'auditLog',
}) {}

function loadCart(repo: CartItemRepository) {
  return repo.getMany({
    select: {
      userId: true,
      qty: true,
      product: { select: { id: true, sku: true, priceCents: true } },
    },
    setCache: true,
  });
}

describe('createDefineRepo class extends', () => {
  it('preserves the model so nested select fields are not never', () => {
    type Item = Awaited<ReturnType<typeof loadCart>>[number];
    expectTypeOf<Item['userId']>().toEqualTypeOf<string>();
    expectTypeOf<Item['product']['sku']>().toEqualTypeOf<string>();
    expectTypeOf<Item['product']['priceCents']>().toEqualTypeOf<number>();
    expectTypeOf<CartItemRepository['createMany']>().toBeFunction();
    expectTypeOf<CartItemRepository['invalidateCache']>().toBeFunction();
  });

  it('omits cache fields when options have no cache', () => {
    expectTypeOf<AuditLogRepository>().not.toHaveProperty('invalidateCache');
  });
});
