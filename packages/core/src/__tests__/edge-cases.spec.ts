import { describe, it, expect, afterEach } from 'vitest';
import {
  buildPrismaMetaFromRuntimeDataModel,
  clearPrismaMeta,
  loadPrismaMetaFromDmmf,
} from '../schema/prisma-meta';
import { AutoComposer } from '../auto-composer';
import { RepositoryRegistry } from '../repository-registry';
import { createRepository } from '../create-repository';
import {
  resetGlobals,
  setupMessyWorld,
  setupSimpleWorld,
  simpleDmmf,
  TestMemoryCache,
  createFakePrisma,
} from './helpers/setup';

describe('remaining edge cases', () => {
  afterEach(() => resetGlobals());

  it('does not alias the same relation object across sibling parents', async () => {
    const { repos } = setupMessyWorld({
      models: {
        user: {
          rows: [{ uid: 'u1', name: 'Ada' }],
          primaryKey: 'uid',
        },
        post: {
          rows: [
            {
              postId: 'p1',
              title: 'A',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
            },
            {
              postId: 'p2',
              title: 'B',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
            },
          ],
          primaryKey: 'postId',
        },
      },
    });

    const rows = await repos.post.getMany({
      where: { postId: { in: ['p1', 'p2'] } },
      select: {
        postId: true,
        writer: { select: { uid: true, name: true } },
      },
    });

    expect(rows[0].writer).toEqual({ uid: 'u1', name: 'Ada' });
    expect(rows[1].writer).toEqual({ uid: 'u1', name: 'Ada' });
    expect(rows[0].writer).not.toBe(rows[1].writer);

    rows[0].writer.name = 'Mutated';
    expect(rows[1].writer.name).toBe('Ada');
  });

  it('honors nested orderBy before per-parent take', async () => {
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
              title: 'A1',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
            },
            {
              postId: 'p2',
              title: 'A2',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
            },
            {
              postId: 'p3',
              title: 'B1',
              writerRef: 'u2',
              editorRef: 'u2',
              categoryCode: 'tech',
            },
            {
              postId: 'p4',
              title: 'B2',
              writerRef: 'u2',
              editorRef: 'u2',
              categoryCode: 'tech',
            },
          ],
          primaryKey: 'postId',
        },
      },
    });

    const rows = await repos.user.getMany({
      where: { uid: { in: ['u1', 'u2'] } },
      select: {
        uid: true,
        posts: {
          select: { postId: true },
          orderBy: { postId: 'desc' },
          take: 1,
        },
      },
    });

    const byUid = Object.fromEntries(rows.map((r: any) => [r.uid, r]));
    expect(byUid.u1.posts).toHaveLength(1);
    expect(byUid.u1.posts[0].postId).toBe('p2');
    expect(byUid.u2.posts).toHaveLength(1);
    expect(byUid.u2.posts[0].postId).toBe('p4');
  });

  it('updateMany default invalidate clears stale getById entity cache', async () => {
    const { repos } = setupSimpleWorld({
      models: {
        user: { rows: [{ id: 'u1', name: 'Ada', password: 'x' }] },
      },
    });

    await repos.user.getById({
      id: 'u1',
      select: { id: true, name: true },
      setCache: true,
    });

    // No explicit invalidate — default must purge entity caches
    await repos.user.updateMany({
      where: { id: 'u1' },
      data: { name: 'Ada2' },
    });

    const row = await repos.user.getById({
      id: 'u1',
      select: { id: true, name: true },
      setCache: true,
    });
    expect(row.name).toBe('Ada2');
  });

  it('compose does not mutate a by-reference cache adapter store', async () => {
    clearPrismaMeta();
    loadPrismaMetaFromDmmf(simpleDmmf);

    // Deliberately broken adapter: returns live references (violates contract)
    class RefCache extends TestMemoryCache {
      override async get<T>(key: string): Promise<T | null> {
        const entry = (this as any).store.get(key);
        if (!entry) return null;
        return entry.value as T; // NO clone
      }
      override async set(
        key: string,
        value: unknown,
        ttlSeconds: number,
      ): Promise<void> {
        (this as any).store.set(key, {
          value, // NO clone
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      }
    }

    const cache = new RefCache('ref');
    const prisma = createFakePrisma({
      models: {
        user: { rows: [{ id: 'u1', name: 'Ada', password: 'x' }] },
        post: { rows: [{ id: 'p1', title: 'Hello', authorId: 'u1' }] },
      },
    });
    const registry = new RepositoryRegistry();
    const autoCompose = new AutoComposer(registry);
    const deps = { prisma, cache, registry, autoCompose };

    const UserRepo = createRepository({
      model: 'user',
      cache: { ttl: 300 },
    });
    const PostRepo = createRepository({
      model: 'post',
      cache: { ttl: 300 },
    });
    const userRepo = new UserRepo(deps);
    const postRepo = new PostRepo(deps);

    // Prime user entity cache
    await userRepo.getById({
      id: 'u1',
      select: { id: true, name: true },
      setCache: true,
    });

    // Compose attaches author; must not corrupt stored cache value
    const post = await postRepo.getById({
      id: 'p1',
      select: {
        id: true,
        author: { select: { id: true, name: true } },
      },
      setCache: true,
    });
    post.author.name = 'Hacked';

    const cachedUser = await userRepo.getById({
      id: 'u1',
      select: { id: true, name: true },
      setCache: true,
    });
    expect(cachedUser.name).toBe('Ada');
  });

  it('runtime data model honors explicit isList:false for reverse 1:1', () => {
    const meta = buildPrismaMetaFromRuntimeDataModel({
      models: {
        User: {
          dbName: 'users',
          fields: [
            { name: 'id', kind: 'scalar', type: 'String', isId: true },
            {
              name: 'profile',
              kind: 'object',
              type: 'Profile',
              isList: false,
              relationName: 'UserProfile',
            },
            {
              name: 'posts',
              kind: 'object',
              type: 'Post',
              isList: true,
              relationName: 'UserPosts',
            },
          ],
        },
        Profile: {
          dbName: 'profiles',
          fields: [
            { name: 'id', kind: 'scalar', type: 'String', isId: true },
            { name: 'userId', kind: 'scalar', type: 'String' },
            {
              name: 'user',
              kind: 'object',
              type: 'User',
              relationName: 'UserProfile',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
            },
          ],
        },
        Post: {
          fields: [
            { name: 'id', kind: 'scalar', type: 'String', isId: true },
            { name: 'authorId', kind: 'scalar', type: 'String' },
            {
              name: 'author',
              kind: 'object',
              type: 'User',
              relationName: 'UserPosts',
              relationFromFields: ['authorId'],
              relationToFields: ['id'],
            },
          ],
        },
      },
    });

    expect(meta.user.relations.profile.kind).toBe('one');
    expect(meta.user.relations.profile.targetFk).toBe('userId');
    expect(meta.user.relations.posts.kind).toBe('many');
    expect(meta.post.relations.author.kind).toBe('one');
    expect(meta.post.relations.author.localFields).toEqual(['authorId']);
  });

  it('runtime data model defaults missing isList without localFk to many', () => {
    const meta = buildPrismaMetaFromRuntimeDataModel({
      models: {
        User: {
          fields: [
            { name: 'id', kind: 'scalar', type: 'String', isId: true },
            // no isList — must not be guessed as reverse 1:1
            { name: 'posts', kind: 'object', type: 'Post', relationName: 'UP' },
          ],
        },
        Post: {
          fields: [
            { name: 'id', kind: 'scalar', type: 'String', isId: true },
            { name: 'authorId', kind: 'scalar', type: 'String' },
            {
              name: 'author',
              kind: 'object',
              type: 'User',
              relationName: 'UP',
              relationFromFields: ['authorId'],
              relationToFields: ['id'],
            },
          ],
        },
      },
    });

    expect(meta.user.relations.posts.kind).toBe('many');
  });
});
