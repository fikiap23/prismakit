import { describe, it, expect, afterEach } from 'vitest';
import {
  buildPrismaMetaFromDmmf,
  clearPrismaMeta,
  getModelMeta,
} from '../schema/prisma-meta';
import { AutoComposer } from '../auto-composer';
import { RepositoryRegistry } from '../repository-registry';
import { resetGlobals, setupMessyWorld, messyDmmf } from './helpers/setup';

describe('auto-compose messy schema', () => {
  afterEach(() => resetGlobals());

  it('meta resolves @@map tables and @map columns', () => {
    const meta = buildPrismaMetaFromDmmf(messyDmmf);
    expect(meta.user.dbTable).toBe('m_user');
    expect(meta.user.columnMap.uid).toBe('user_id');
    expect(meta.user.columnMap.name).toBe('full_name');
    expect(meta.post.dbTable).toBe('tbl_posts_2024');
    expect(meta.post.columnMap.writerRef).toBe('writer_ref');
    expect(meta.user.primaryKey).toBe('uid');
    expect(meta.category.primaryKey).toBe('code');
    expect(meta.postTag.primaryKey).toEqual(['postId', 'tagId']);
  });

  it('resolves dual relations to same target with different FKs', async () => {
    const { repos } = setupMessyWorld({
      models: {
        user: {
          rows: [
            { uid: 'u1', name: 'Ada' },
            { uid: 'u2', name: 'Bob' },
          ],
          primaryKey: 'uid',
        },
        post: {
          rows: [
            {
              postId: 'p1',
              title: 'X',
              writerRef: 'u1',
              editorRef: 'u2',
              categoryCode: 'tech',
            },
          ],
          primaryKey: 'postId',
        },
      },
    });

    const row = await repos.post.getById({
      id: 'p1',
      select: {
        postId: true,
        writer: { select: { name: true } },
        editor: { select: { name: true } },
      },
    });

    expect(row.writer.name).toBe('Ada');
    expect(row.editor.name).toBe('Bob');
  });

  it('composes relation that references a unique non-PK field', async () => {
    const { repos } = setupMessyWorld({
      models: {
        warehouse: {
          rows: [{ id: 'w1', code: 'WH-A', name: 'Alpha' }],
        },
        stock: {
          rows: [{ id: 's1', qty: 10, warehouseCode: 'WH-A' }],
        },
      },
    });

    const row = await repos.stock.getById({
      id: 's1',
      select: {
        id: true,
        qty: true,
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });

    // warehouseCode references Warehouse.code (NOT Warehouse.id)
    expect(row.warehouse).toEqual({
      id: 'w1',
      code: 'WH-A',
      name: 'Alpha',
    });
  });

  it('composes composite FK OrderLine.order → Order', async () => {
    const { repos } = setupMessyWorld({
      models: {
        order: {
          rows: [{ tenantId: 't1', orderNo: '100', status: 'open' }],
          primaryKey: ['tenantId', 'orderNo'],
        },
        orderLine: {
          rows: [
            { id: 'l1', tenantId: 't1', orderNo: '100', sku: 'SKU-1' },
          ],
        },
      },
    });

    const row = await repos.orderLine.getById({
      id: 'l1',
      select: {
        id: true,
        sku: true,
        order: { select: { tenantId: true, orderNo: true, status: true } },
      },
    });

    expect(row.order).toEqual({
      tenantId: 't1',
      orderNo: '100',
      status: 'open',
    });
  });

  it('composes to-many via composite opposite FK (Order.lines)', async () => {
    const { repos } = setupMessyWorld({
      models: {
        order: {
          rows: [{ tenantId: 't1', orderNo: '100', status: 'open' }],
          primaryKey: ['tenantId', 'orderNo'],
        },
        orderLine: {
          rows: [
            { id: 'l1', tenantId: 't1', orderNo: '100', sku: 'A' },
            { id: 'l2', tenantId: 't1', orderNo: '100', sku: 'B' },
            { id: 'l3', tenantId: 't1', orderNo: '999', sku: 'C' },
          ],
        },
      },
    });

    const row = await repos.order.getById({
      id: { tenantId: 't1', orderNo: '100' },
      select: {
        status: true,
        lines: { select: { id: true, sku: true } },
      },
    });

    expect(row.lines.map((l: { id: string }) => l.id).sort()).toEqual([
      'l1',
      'l2',
    ]);
  });

  it('throws actionable error for implicit many-to-many', async () => {
    const { repos } = setupMessyWorld({
      models: {
        post: {
          rows: [
            {
              postId: 'p1',
              title: 'X',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
            },
          ],
          primaryKey: 'postId',
        },
        tag: { rows: [{ id: 't1', name: 'ts' }] },
      },
    });

    await expect(
      repos.post.getById({
        id: 'p1',
        select: {
          postId: true,
          tags: { select: { id: true, name: true } },
        },
      }),
    ).rejects.toThrow(/implicit many-to-many|join model|PostTag|explicit/i);
  });

  it('throws when targetFk cannot be resolved (no silent wrong query)', async () => {
    clearPrismaMeta();
    // No meta loaded — force convention fallback with mismatched names
    const registry = new RepositoryRegistry();
    registry.register('user', {
      repository: {
        getMany: async () => {
          throw new Error('should not be called with wrong FK');
        },
      },
      scalarFields: { id: 'id', name: 'name' },
    });
    registry.register('weird', {
      repository: { getMany: async () => [] },
      scalarFields: { id: 'id', customOwnerKey: 'customOwnerKey' },
    });

    const composer = new AutoComposer(registry);
    const rows = [{ id: 'w1', customOwnerKey: 'u1' }];

    // Without meta, relation "owner" falls back to ownerId which does not exist.
    // Should throw actionable error rather than attaching null silently after bad query.
    await expect(
      composer.composeMany(
        rows,
        { owner: { select: { id: true } } },
        'weird',
      ),
    ).rejects.toThrow(/owner|foreign key|FK|registered|meta/i);
  });

  it('marks composite PK in meta for PostTag and Order', () => {
    const meta = buildPrismaMetaFromDmmf(messyDmmf);
    expect(meta.postTag.primaryKey).toEqual(['postId', 'tagId']);
    expect(meta.order.primaryKey).toEqual(['tenantId', 'orderNo']);
    expect(getModelMeta('postTag') === undefined).toBe(true); // not loaded yet
  });
});
