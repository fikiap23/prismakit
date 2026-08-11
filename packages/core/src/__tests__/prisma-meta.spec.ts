import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { splitSelect } from '../utils/split-select';
import {
  buildPrismaMetaFromDmmf,
  clearPrismaMeta,
  getModelMeta,
  loadPrismaMetaFromDmmf,
  type PrismaDmmfLike,
} from '../schema/prisma-meta';
import { buildLockConfigFromMeta } from '../lock/build-lock-config';
import { RepositoryRegistry } from '../repository-registry';
import { resolveRelationModel } from '../compose/relation-resolver';
import { AutoComposer } from '../auto-composer';
import { parsePrismaSchema } from '../schema/parse-prisma-schema';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const sampleDmmf: PrismaDmmfLike = {
  datamodel: {
    models: [
      {
        name: 'User',
        dbName: 'users',
        primaryKey: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            type: 'String',
            isList: false,
            isId: true,
            dbName: null,
          },
          {
            name: 'name',
            kind: 'scalar',
            type: 'String',
            isList: false,
            dbName: 'full_name',
          },
          {
            name: 'posts',
            kind: 'object',
            type: 'Post',
            isList: true,
            relationName: 'UserPosts',
            relationFromFields: [],
            relationToFields: [],
          },
        ],
      },
      {
        name: 'Post',
        dbName: 'posts',
        primaryKey: null,
        fields: [
          {
            name: 'id',
            kind: 'scalar',
            type: 'String',
            isList: false,
            isId: true,
          },
          {
            name: 'title',
            kind: 'scalar',
            type: 'String',
            isList: false,
          },
          {
            name: 'authorUserId',
            kind: 'scalar',
            type: 'String',
            isList: false,
            dbName: 'author_user_id',
          },
          {
            name: 'editorUserId',
            kind: 'scalar',
            type: 'String',
            isList: false,
          },
          {
            name: 'author',
            kind: 'object',
            type: 'User',
            isList: false,
            relationName: 'UserPosts',
            relationFromFields: ['authorUserId'],
            relationToFields: ['id'],
          },
          {
            name: 'editor',
            kind: 'object',
            type: 'User',
            isList: false,
            relationName: 'PostEditor',
            relationFromFields: ['editorUserId'],
            relationToFields: ['id'],
          },
        ],
      },
    ],
  },
};

describe('prisma meta / free naming', () => {
  beforeEach(() => {
    clearPrismaMeta();
  });
  afterEach(() => {
    clearPrismaMeta();
  });

  it('builds relation graph with non-default FKs', () => {
    const meta = buildPrismaMetaFromDmmf(sampleDmmf);
    expect(meta.post.relations.author).toMatchObject({
      targetModel: 'user',
      kind: 'one',
      localFields: ['authorUserId'],
    });
    expect(meta.post.relations.editor.localFields).toEqual(['editorUserId']);
    expect(meta.user.relations.posts).toMatchObject({
      kind: 'many',
      targetFk: 'authorUserId',
      targetModel: 'post',
    });
    expect(meta.user.primaryKey).toBe('id');
    expect(meta.user.dbTable).toBe('users');
    expect(meta.user.columnMap.name).toBe('full_name');
  });

  it('splitSelect uses meta local FKs', () => {
    const meta = buildPrismaMetaFromDmmf(sampleDmmf);
    const relFks = Object.fromEntries(
      Object.entries(meta.post.relations).map(([k, v]) => [k, v.localFields]),
    );
    const { dbSelect, relations } = splitSelect(
      {
        id: true,
        author: { select: { id: true, name: true } },
        editor: { select: { id: true } },
      },
      meta.post.scalarFields,
      relFks,
    );
    expect(dbSelect).toEqual({
      id: true,
      authorUserId: true,
      editorUserId: true,
    });
    expect(relations).toHaveProperty('author');
    expect(relations).toHaveProperty('editor');
  });

  it('builds targetFk for reverse one-to-one relations', () => {
    const dmmf: PrismaDmmfLike = {
      datamodel: {
        models: [
          {
            name: 'UsagePart',
            dbName: 'usage_parts',
            primaryKey: null,
            fields: [
              {
                name: 'id',
                kind: 'scalar',
                type: 'String',
                isList: false,
                isId: true,
              },
              {
                name: 'sparepart',
                kind: 'object',
                type: 'Sparepart',
                isList: false,
                relationName: 'UsagePartSparepart',
                relationFromFields: [],
                relationToFields: [],
              },
            ],
          },
          {
            name: 'Sparepart',
            dbName: 'spareparts',
            primaryKey: null,
            fields: [
              {
                name: 'id',
                kind: 'scalar',
                type: 'String',
                isList: false,
                isId: true,
              },
              {
                name: 'sourceUsagePartId',
                kind: 'scalar',
                type: 'String',
                isList: false,
                dbName: 'source_usage_part_id',
              },
              {
                name: 'sourceUsagePart',
                kind: 'object',
                type: 'UsagePart',
                isList: false,
                relationName: 'UsagePartSparepart',
                relationFromFields: ['sourceUsagePartId'],
                relationToFields: ['id'],
              },
            ],
          },
        ],
      },
    };

    const meta = buildPrismaMetaFromDmmf(dmmf);
    expect(meta.usagePart.relations.sparepart).toMatchObject({
      kind: 'one',
      localFields: [],
      targetFk: 'sourceUsagePartId',
      targetModel: 'sparepart',
    });
  });

  it('resolveRelationModel uses DMMF target per source model', () => {
    loadPrismaMetaFromDmmf(sampleDmmf);
    const registry = new RepositoryRegistry();
    registry.register('user', {
      repository: { getMany: async () => [] },
    });
    registry.register('post', {
      repository: { getMany: async () => [] },
    });
    expect(resolveRelationModel('author', registry, 'post')).toBe('user');
    expect(resolveRelationModel('editor', registry, 'post')).toBe('user');
    expect(resolveRelationModel('posts', registry, 'user')).toBe('post');
  });

  it('resolveRelationModel throws when meta is not loaded', () => {
    const registry = new RepositoryRegistry();
    expect(() => resolveRelationModel('author', registry, 'post')).toThrow(
      /schema meta is not loaded/,
    );
  });

  it('resolveRelationModel throws when relation is absent', () => {
    loadPrismaMetaFromDmmf(sampleDmmf);
    const registry = new RepositoryRegistry();
    expect(() => resolveRelationModel('images', registry, 'post')).toThrow(
      /is not on schema model "post"/,
    );
  });

  it('resolveRelationModel throws when target repo is missing', () => {
    loadPrismaMetaFromDmmf(sampleDmmf);
    const registry = new RepositoryRegistry();
    expect(() => resolveRelationModel('author', registry, 'post')).toThrow(
      /no repository is registered for "user"/,
    );
  });

  it('buildLockConfigFromMeta resolves client key and columns', () => {
    loadPrismaMetaFromDmmf(sampleDmmf);
    const lock = buildLockConfigFromMeta('user');
    expect(lock).toEqual({
      tableName: 'users',
      columns: { id: 'id', name: 'full_name' },
    });
  });

  it('AutoComposer attaches to-one via custom FK', async () => {
    loadPrismaMetaFromDmmf(sampleDmmf);
    const registry = new RepositoryRegistry();
    const users = [
      { id: 'u1', name: 'Ada' },
      { id: 'u2', name: 'Bob' },
    ];
    registry.register('user', {
      repository: {
        getMany: async ({ where }) => {
          const ids = where.id.in as string[];
          return users.filter((u) => ids.includes(u.id));
        },
      },
      scalarFields: getModelMeta('user')!.scalarFields,
    });
    registry.register('post', {
      repository: { getMany: async () => [] },
      scalarFields: getModelMeta('post')!.scalarFields,
    });

    const composer = new AutoComposer(registry);
    const rows = [
      { id: 'p1', authorUserId: 'u1', editorUserId: 'u2' },
    ];
    await composer.composeMany(
      rows,
      {
        author: { select: { id: true, name: true } },
        editor: { select: { id: true, name: true } },
      },
      'post',
    );
    expect(rows[0].author).toEqual({ id: 'u1', name: 'Ada' });
    expect(rows[0].editor).toEqual({ id: 'u2', name: 'Bob' });
  });

  it('AutoComposer injects target PK when nested select omits id', async () => {
    loadPrismaMetaFromDmmf(sampleDmmf);
    const registry = new RepositoryRegistry();
    const users = [
      { id: 'u1', name: 'Ada' },
      { id: 'u2', name: 'Bob' },
    ];
    const seenSelects: Array<Record<string, unknown> | undefined> = [];
    registry.register('user', {
      repository: {
        getMany: async ({ where, select }: any) => {
          seenSelects.push(select);
          const ids = where.id.in as string[];
          return users
            .filter((u) => ids.includes(u.id))
            .map((u) => {
              if (!select) return { ...u };
              const row: Record<string, unknown> = {};
              for (const key of Object.keys(select)) {
                if (select[key]) row[key] = (u as any)[key];
              }
              return row;
            });
        },
      },
      scalarFields: getModelMeta('user')!.scalarFields,
    });
    registry.register('post', {
      repository: { getMany: async () => [] },
      scalarFields: getModelMeta('post')!.scalarFields,
    });

    const composer = new AutoComposer(registry);
    const rows = [
      { id: 'p1', authorUserId: 'u1', editorUserId: 'u2' },
    ];
    await composer.composeMany(
      rows,
      {
        // Intentionally omit `id` — AutoComposer must inject it for mapping.
        author: { select: { name: true } },
        editor: { select: { name: true } },
      },
      'post',
    );

    expect(seenSelects).toHaveLength(2);
    for (const select of seenSelects) {
      expect(select).toEqual({ name: true, id: true });
    }
    expect(rows[0].author).toEqual({ id: 'u1', name: 'Ada' });
    expect(rows[0].editor).toEqual({ id: 'u2', name: 'Bob' });
  });

  it('AutoComposer attaches to-many via opposite FK', async () => {
    loadPrismaMetaFromDmmf(sampleDmmf);
    const registry = new RepositoryRegistry();
    const posts = [
      { id: 'p1', authorUserId: 'u1', title: 'A' },
      { id: 'p2', authorUserId: 'u1', title: 'B' },
      { id: 'p3', authorUserId: 'u2', title: 'C' },
    ];
    registry.register('post', {
      repository: {
        getMany: async ({ where }) => {
          const ids = where.authorUserId.in as string[];
          return posts.filter((p) => ids.includes(p.authorUserId));
        },
      },
      scalarFields: getModelMeta('post')!.scalarFields,
    });
    registry.register('user', {
      repository: { getMany: async () => [] },
      scalarFields: getModelMeta('user')!.scalarFields,
    });

    const composer = new AutoComposer(registry);
    const users = [{ id: 'u1', name: 'Ada' }];
    await composer.composeMany(
      users,
      { posts: { select: { id: true, title: true } } },
      'user',
    );
    expect(users[0].posts).toHaveLength(2);
    expect(users[0].posts.map((p: { id: string }) => p.id).sort()).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('parsePrismaSchema reads @relation fields and @id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-schema-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
model User {
  id    String @id
  posts Post[] @relation("UserPosts")
  @@map("users")
}

model Post {
  id           String @id
  authorUserId String @map("author_user_id")
  author       User   @relation("UserPosts", fields: [authorUserId], references: [id])
  @@map("posts")
}
`,
    );
    const models = parsePrismaSchema(schemaPath);
    const post = models.find((m) => m.name === 'Post')!;
    const author = post.fields.find((f) => f.name === 'author')!;
    expect(author.relationFromFields).toEqual(['authorUserId']);
    expect(author.relationToFields).toEqual(['id']);
    expect(post.primaryKey).toBe('id');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('parsePrismaSchema reads composite @@id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-schema-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
model ProductTag {
  productId String
  tagId     String
  product   Product @relation(fields: [productId], references: [id])
  tag       Tag     @relation(fields: [tagId], references: [id])
  @@id([productId, tagId])
}

model Product {
  id   String       @id
  tags ProductTag[]
}

model Tag {
  id       String       @id
  products ProductTag[]
}
`,
    );
    const models = parsePrismaSchema(schemaPath);
    const productTag = models.find((m) => m.name === 'ProductTag')!;
    expect(productTag.primaryKey).toEqual(['productId', 'tagId']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
