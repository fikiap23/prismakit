import type { PrismaDmmfLike, DmmfFieldLike, DmmfModelLike } from '../../schema/prisma-meta';

function scalar(
  name: string,
  type = 'String',
  opts: Partial<DmmfFieldLike> = {},
): DmmfFieldLike {
  return {
    name,
    kind: 'scalar',
    type,
    isList: false,
    dbName: null,
    ...opts,
  };
}

function relation(
  name: string,
  type: string,
  opts: Partial<DmmfFieldLike> = {},
): DmmfFieldLike {
  return {
    name,
    kind: 'object',
    type,
    isList: false,
    relationFromFields: [],
    relationToFields: [],
    ...opts,
  };
}

/**
 * Intentionally messy DMMF covering:
 * - non-id PKs, @@map / @map, dual relations to same target
 * - reverse 1:1, non-PK references, composite PK/FK
 * - explicit + implicit m:n, self-relation
 */
export const messyDmmf: PrismaDmmfLike = {
  datamodel: {
    models: [
      {
        name: 'User',
        dbName: 'm_user',
        primaryKey: null,
        fields: [
          scalar('uid', 'String', { isId: true, dbName: 'user_id' }),
          scalar('name', 'String', { dbName: 'full_name' }),
          relation('profile', 'Profile', {
            relationName: 'UserProfile',
            relationFromFields: [],
            relationToFields: [],
          }),
          relation('posts', 'Post', {
            isList: true,
            relationName: 'PostWriter',
            relationFromFields: [],
            relationToFields: [],
          }),
          relation('editedPosts', 'Post', {
            isList: true,
            relationName: 'PostEditor',
            relationFromFields: [],
            relationToFields: [],
          }),
          relation('comments', 'Comment', {
            isList: true,
            relationName: 'CommentAuthor',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      },
      {
        name: 'Profile',
        dbName: 'm_profile',
        primaryKey: null,
        fields: [
          scalar('id', 'String', { isId: true }),
          scalar('bio', 'String'),
          scalar('ownerUid', 'String', { dbName: 'owner_uid' }),
          relation('owner', 'User', {
            relationName: 'UserProfile',
            relationFromFields: ['ownerUid'],
            relationToFields: ['uid'],
          }),
        ],
      },
      {
        name: 'Category',
        dbName: 'kategori',
        primaryKey: null,
        fields: [
          scalar('code', 'String', { isId: true, dbName: 'kat_code' }),
          scalar('label', 'String'),
          relation('posts', 'Post', {
            isList: true,
            relationName: 'PostCategory',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      },
      {
        name: 'Post',
        dbName: 'tbl_posts_2024',
        primaryKey: null,
        fields: [
          scalar('postId', 'String', { isId: true, dbName: 'post_id' }),
          scalar('title', 'String'),
          scalar('writerRef', 'String', { dbName: 'writer_ref' }),
          scalar('editorRef', 'String', { dbName: 'editor_ref' }),
          scalar('categoryCode', 'String', { dbName: 'category_code' }),
          relation('writer', 'User', {
            relationName: 'PostWriter',
            relationFromFields: ['writerRef'],
            relationToFields: ['uid'],
          }),
          relation('editor', 'User', {
            relationName: 'PostEditor',
            relationFromFields: ['editorRef'],
            relationToFields: ['uid'],
          }),
          relation('category', 'Category', {
            relationName: 'PostCategory',
            relationFromFields: ['categoryCode'],
            relationToFields: ['code'],
          }),
          relation('tags', 'Tag', {
            isList: true,
            relationName: 'PostTagsImplicit',
            relationFromFields: [],
            relationToFields: [],
          }),
          relation('postTags', 'PostTag', {
            isList: true,
            relationName: 'PostToPostTag',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      },
      {
        name: 'Tag',
        dbName: 'tags',
        primaryKey: null,
        fields: [
          scalar('id', 'String', { isId: true }),
          scalar('name', 'String'),
          relation('posts', 'Post', {
            isList: true,
            relationName: 'PostTagsImplicit',
            relationFromFields: [],
            relationToFields: [],
          }),
          relation('postTags', 'PostTag', {
            isList: true,
            relationName: 'TagToPostTag',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      },
      {
        name: 'PostTag',
        dbName: 'post_tags',
        primaryKey: { name: null, fields: ['postId', 'tagId'] },
        fields: [
          scalar('postId', 'String', { dbName: 'post_id' }),
          scalar('tagId', 'String', { dbName: 'tag_id' }),
          relation('post', 'Post', {
            relationName: 'PostToPostTag',
            relationFromFields: ['postId'],
            relationToFields: ['postId'],
          }),
          relation('tag', 'Tag', {
            relationName: 'TagToPostTag',
            relationFromFields: ['tagId'],
            relationToFields: ['id'],
          }),
        ],
      },
      {
        name: 'Warehouse',
        dbName: 'wh',
        primaryKey: null,
        fields: [
          scalar('id', 'String', { isId: true }),
          scalar('code', 'String'),
          scalar('name', 'String'),
          relation('stocks', 'Stock', {
            isList: true,
            relationName: 'WarehouseStock',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      },
      {
        name: 'Stock',
        dbName: 'stocks',
        primaryKey: null,
        fields: [
          scalar('id', 'String', { isId: true }),
          scalar('qty', 'Int'),
          scalar('warehouseCode', 'String', { dbName: 'warehouse_code' }),
          relation('warehouse', 'Warehouse', {
            relationName: 'WarehouseStock',
            relationFromFields: ['warehouseCode'],
            relationToFields: ['code'],
          }),
        ],
      },
      {
        name: 'Order',
        dbName: 'orders',
        primaryKey: { name: null, fields: ['tenantId', 'orderNo'] },
        fields: [
          scalar('tenantId', 'String', { dbName: 'tenant_id' }),
          scalar('orderNo', 'String', { dbName: 'order_no' }),
          scalar('status', 'String'),
          relation('lines', 'OrderLine', {
            isList: true,
            relationName: 'OrderLines',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      },
      {
        name: 'OrderLine',
        dbName: 'order_lines',
        primaryKey: null,
        fields: [
          scalar('id', 'String', { isId: true }),
          scalar('tenantId', 'String', { dbName: 'tenant_id' }),
          scalar('orderNo', 'String', { dbName: 'order_no' }),
          scalar('sku', 'String'),
          relation('order', 'Order', {
            relationName: 'OrderLines',
            relationFromFields: ['tenantId', 'orderNo'],
            relationToFields: ['tenantId', 'orderNo'],
          }),
        ],
      },
      {
        name: 'Comment',
        dbName: 'comments',
        primaryKey: null,
        fields: [
          scalar('id', 'String', { isId: true }),
          scalar('body', 'String'),
          scalar('authorUid', 'String', { dbName: 'author_uid' }),
          scalar('parentId', 'String', { dbName: 'parent_id' }),
          relation('author', 'User', {
            relationName: 'CommentAuthor',
            relationFromFields: ['authorUid'],
            relationToFields: ['uid'],
          }),
          relation('parent', 'Comment', {
            relationName: 'CommentTree',
            relationFromFields: ['parentId'],
            relationToFields: ['id'],
          }),
          relation('replies', 'Comment', {
            isList: true,
            relationName: 'CommentTree',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      },
    ] satisfies DmmfModelLike[],
  },
};

/** Minimal clean DMMF for cache / lock tests (standard id PK). */
export const simpleDmmf: PrismaDmmfLike = {
  datamodel: {
    models: [
      {
        name: 'User',
        dbName: 'users',
        primaryKey: null,
        fields: [
          scalar('id', 'String', { isId: true }),
          scalar('name', 'String', { dbName: 'full_name' }),
          scalar('password', 'String'),
          relation('posts', 'Post', {
            isList: true,
            relationName: 'UserPosts',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      },
      {
        name: 'Post',
        dbName: 'posts',
        primaryKey: null,
        fields: [
          scalar('id', 'String', { isId: true }),
          scalar('title', 'String'),
          scalar('authorId', 'String', { dbName: 'author_id' }),
          relation('author', 'User', {
            relationName: 'UserPosts',
            relationFromFields: ['authorId'],
            relationToFields: ['id'],
          }),
        ],
      },
      {
        name: 'PostTag',
        dbName: 'post_tags',
        primaryKey: { name: null, fields: ['postId', 'tagId'] },
        fields: [
          scalar('postId', 'String', { dbName: 'post_id' }),
          scalar('tagId', 'String', { dbName: 'tag_id' }),
          scalar('label', 'String'),
        ],
      },
    ],
  },
};
