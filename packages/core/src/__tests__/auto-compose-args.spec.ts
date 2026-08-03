import { describe, it, expect, afterEach, vi } from 'vitest';
import { splitSelect } from '../utils/split-select';
import { setComposeOptions } from '../compose/compose-options';
import { AutoComposer } from '../auto-composer';
import { RepositoryRegistry } from '../repository-registry';
import { loadPrismaMetaFromDmmf } from '../schema/prisma-meta';
import { resetGlobals, setupMessyWorld, simpleDmmf } from './helpers/setup';

describe('auto-compose nested args & edge cases', () => {
  afterEach(() => {
    resetGlobals();
    vi.restoreAllMocks();
  });

  it('applies nested where without overwriting the FK IN clause', async () => {
    const { repos, prisma } = setupMessyWorld({
      models: {
        user: {
          rows: [{ uid: 'u1', name: 'Ada' }],
          primaryKey: 'uid',
        },
        post: {
          rows: [
            {
              postId: 'p1',
              title: 'draft',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
              published: false,
            },
            {
              postId: 'p2',
              title: 'live',
              writerRef: 'u1',
              editorRef: 'u1',
              categoryCode: 'tech',
              published: true,
            },
          ],
          primaryKey: 'postId',
        },
      },
    });

    // Fake prisma matchWhere doesn't know `published` filter via nested where
    // unless we pass it — extend rows and use where on title instead.
    const row = await repos.user.getById({
      id: 'u1',
      select: {
        uid: true,
        posts: {
          where: { title: 'live' },
          select: { postId: true, title: true },
        },
      },
    });

    expect(row.posts).toHaveLength(1);
    expect(row.posts[0].postId).toBe('p2');

    // Ensure the FK filter was preserved (AND merge), not overwritten
    const findMany = prisma.__calls.find(
      (c) => c.model === 'post' && c.method === 'findMany',
    );
    expect(findMany).toBeTruthy();
    const where = findMany!.args.where as Record<string, unknown>;
    // Must still constrain by writerRef somehow (direct or via AND)
    const whereStr = JSON.stringify(where);
    expect(whereStr).toMatch(/writerRef/);
    expect(whereStr).toMatch(/live|title/);
  });

  it('applies nested take per parent, not globally', async () => {
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
          take: 1,
          orderBy: { postId: 'asc' },
        },
      },
    });

    expect(rows).toHaveLength(2);
    // Each parent gets at most 1 post (Prisma semantics), not 1 total.
    expect(rows[0].posts).toHaveLength(1);
    expect(rows[1].posts).toHaveLength(1);
  });

  it('treats relation args without select as empty select (not as field map)', async () => {
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

    const row = await repos.user.getById({
      id: 'u1',
      select: {
        uid: true,
        // where-only relation object — must not treat `where` as a nested relation key
        posts: { where: { title: 'A' } },
      },
    });

    expect(Array.isArray(row.posts)).toBe(true);
    expect(row.posts[0]).not.toHaveProperty('where');
  });

  it('keeps falsy FK values (0 / empty string) instead of dropping them', async () => {
    loadPrismaMetaFromDmmf(simpleDmmf);
    const registry = new RepositoryRegistry();
    const seenWhere: unknown[] = [];
    registry.register('user', {
      repository: {
        getMany: async ({ where }) => {
          seenWhere.push(where);
          const ids = (where as any).id.in as unknown[];
          return ids.map((id) => ({ id, name: `n-${id}` }));
        },
      },
      scalarFields: { id: 'id', name: 'name' },
    });
    registry.register('post', {
      repository: { getMany: async () => [] },
      scalarFields: { id: 'id', authorId: 'authorId', title: 'title' },
    });

    // Patch meta-less path: use localFk convention authorId
    clearAndLoadAuthorMeta();

    const composer = new AutoComposer(registry);
    const rows = [
      { id: 'p1', authorId: 0 as unknown as string },
      { id: 'p2', authorId: '' },
    ];
    await composer.composeMany(
      rows,
      { author: { select: { id: true, name: true } } },
      'post',
    );

    expect(seenWhere.length).toBeGreaterThan(0);
    const ids = (seenWhere[0] as any).id.in as unknown[];
    expect(ids).toContain(0);
    expect(ids).toContain('');
  });

  it('fills null/[] when maxDepth is reached (not undefined)', async () => {
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
        category: {
          rows: [{ code: 'tech', label: 'Tech' }],
          primaryKey: 'code',
        },
      },
    });

    setComposeOptions({ maxDepth: 0 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const row = await repos.user.getById({
      id: 'u1',
      select: {
        uid: true,
        posts: {
          select: {
            postId: true,
            category: { select: { code: true } },
          },
        },
      },
    });

    // depth 0 → skip composing posts entirely
    expect(row.posts === null || Array.isArray(row.posts)).toBe(true);
    expect(row.posts).not.toBeUndefined();
    warn.mockRestore();
  });

  it('isolates splitSelect cache across different scalar field enums', () => {
    const sharedSelect = {
      id: true,
      author: { select: { id: true } },
    };
    const scalarsA = { id: 'id', authorId: 'authorId', title: 'title' };
    const scalarsB = { id: 'id', name: 'name' }; // no authorId

    const a1 = splitSelect(sharedSelect, scalarsA, {
      author: ['authorId'],
    });
    const b1 = splitSelect(sharedSelect, scalarsB, {});

    // Re-split A — must still inject authorId, not reuse B's result
    const a2 = splitSelect(sharedSelect, scalarsA, {
      author: ['authorId'],
    });

    expect(a1.dbSelect).toMatchObject({ id: true, authorId: true });
    expect(a2.dbSelect).toMatchObject({ id: true, authorId: true });
    expect((b1.dbSelect as any).authorId).toBeUndefined();
  });
});

function clearAndLoadAuthorMeta() {
  // Use simpleDmmf which already has Post.author → authorId
  loadPrismaMetaFromDmmf(simpleDmmf);
}
