import { describe, it, expect, afterEach } from 'vitest';
import { resetGlobals, setupMessyWorld } from './helpers/setup';

describe('auto-compose cardinality', () => {
  afterEach(() => resetGlobals());

  it('composes owning 1:1 (Profile.owner → User)', async () => {
    const { repos } = setupMessyWorld({
      models: {
        user: {
          rows: [{ uid: 'u1', name: 'Ada' }],
          primaryKey: 'uid',
        },
        profile: {
          rows: [{ id: 'pr1', bio: 'bio', ownerUid: 'u1' }],
        },
      },
    });

    const row = await repos.profile.getById({
      id: 'pr1',
      select: {
        id: true,
        bio: true,
        owner: { select: { uid: true, name: true } },
      },
    });

    expect(row).toMatchObject({
      id: 'pr1',
      bio: 'bio',
      owner: { uid: 'u1', name: 'Ada' },
    });
  });

  it('composes reverse 1:1 (User.profile ← Profile.ownerUid)', async () => {
    const { repos } = setupMessyWorld({
      models: {
        user: {
          rows: [{ uid: 'u1', name: 'Ada' }],
          primaryKey: 'uid',
        },
        profile: {
          rows: [{ id: 'pr1', bio: 'bio', ownerUid: 'u1' }],
        },
      },
    });

    const row = await repos.user.getById({
      id: 'u1',
      select: {
        uid: true,
        name: true,
        profile: { select: { id: true, bio: true } },
      },
    });

    expect(row).toMatchObject({
      uid: 'u1',
      profile: { id: 'pr1', bio: 'bio' },
    });
  });

  it('composes N:1 (Post.writer / Post.editor → User)', async () => {
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
              title: 'Hello',
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
        title: true,
        writer: { select: { uid: true, name: true } },
        editor: { select: { uid: true, name: true } },
      },
    });

    expect(row.writer).toEqual({ uid: 'u1', name: 'Ada' });
    expect(row.editor).toEqual({ uid: 'u2', name: 'Bob' });
  });

  it('composes 1:N (User.posts)', async () => {
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
            {
              postId: 'p3',
              title: 'C',
              writerRef: 'u2',
              editorRef: 'u2',
              categoryCode: 'tech',
            },
          ],
          primaryKey: 'postId',
        },
      },
    });

    const row = await repos.user.getById({
      id: 'u1',
      select: {
        uid: true,
        posts: { select: { postId: true, title: true } },
      },
    });

    expect(row.posts.map((p: { postId: string }) => p.postId).sort()).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('composes explicit m:n via join model (Post → postTags → tag)', async () => {
    const { repos } = setupMessyWorld({
      models: {
        post: {
          rows: [
            {
              postId: 'p1',
              title: 'Hello',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
            },
          ],
          primaryKey: 'postId',
        },
        tag: {
          rows: [
            { id: 't1', name: 'ts' },
            { id: 't2', name: 'node' },
          ],
        },
        postTag: {
          rows: [
            { postId: 'p1', tagId: 't1' },
            { postId: 'p1', tagId: 't2' },
          ],
          primaryKey: ['postId', 'tagId'],
        },
      },
    });

    const row = await repos.post.getById({
      id: 'p1',
      select: {
        postId: true,
        postTags: {
          select: {
            tagId: true,
            tag: { select: { id: true, name: true } },
          },
        },
      },
    });

    expect(row.postTags).toHaveLength(2);
    const names = row.postTags
      .map((pt: { tag: { name: string } }) => pt.tag.name)
      .sort();
    expect(names).toEqual(['node', 'ts']);
  });

  it('composes self-relation Comment.replies', async () => {
    const { repos } = setupMessyWorld({
      models: {
        comment: {
          rows: [
            { id: 'c1', body: 'root', authorUid: 'u1', parentId: null },
            { id: 'c2', body: 'r1', authorUid: 'u1', parentId: 'c1' },
            { id: 'c3', body: 'r2', authorUid: 'u2', parentId: 'c1' },
          ],
        },
      },
    });

    const row = await repos.comment.getById({
      id: 'c1',
      select: {
        id: true,
        body: true,
        replies: { select: { id: true, body: true } },
      },
    });

    expect(row.replies.map((r: { id: string }) => r.id).sort()).toEqual([
      'c2',
      'c3',
    ]);
  });

  it('composes deep nesting user → posts → category + postTags → tag', async () => {
    const { repos } = setupMessyWorld({
      models: {
        user: {
          rows: [{ uid: 'u1', name: 'Ada' }],
          primaryKey: 'uid',
        },
        category: {
          rows: [{ code: 'tech', label: 'Technology' }],
          primaryKey: 'code',
        },
        post: {
          rows: [
            {
              postId: 'p1',
              title: 'Hello',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
            },
          ],
          primaryKey: 'postId',
        },
        tag: { rows: [{ id: 't1', name: 'ts' }] },
        postTag: {
          rows: [{ postId: 'p1', tagId: 't1' }],
          primaryKey: ['postId', 'tagId'],
        },
      },
    });

    const row = await repos.user.getById({
      id: 'u1',
      select: {
        uid: true,
        posts: {
          select: {
            postId: true,
            title: true,
            category: { select: { code: true, label: true } },
            postTags: {
              select: {
                tag: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    expect(row.posts).toHaveLength(1);
    expect(row.posts[0].category).toEqual({
      code: 'tech',
      label: 'Technology',
    });
    expect(row.posts[0].postTags[0].tag).toEqual({ id: 't1', name: 'ts' });
  });

  it('injects root PK when parent select omits it (needed for to-many)', async () => {
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
          ],
          primaryKey: 'postId',
        },
      },
    });

    // Intentionally omit `uid` from root select — to-many needs it.
    const row = await repos.user.getById({
      id: 'u1',
      select: {
        name: true,
        posts: { select: { postId: true, title: true } },
      },
    });

    expect(row.posts).toHaveLength(1);
    expect(row.posts[0].postId).toBe('p1');
    // PK may be injected into payload for mapping
    expect(row.uid ?? row.name).toBeTruthy();
  });
});
