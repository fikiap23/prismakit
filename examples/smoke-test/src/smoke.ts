/**
 * Real Prisma + PrismaKit smoke runner.
 *
 * Usage (from repo root):
 *   pnpm --filter @prismakit/example-smoke-test test
 *
 * Or from this package:
 *   pnpm test
 */
import assert from 'node:assert/strict';
import { createSmokeKit } from './kit.js';
import { seed } from './seed.js';

type Case = { name: string; run: () => Promise<void> };

function section(title: string) {
  console.log(`\n── ${title}`);
}

async function main() {
  const kit = createSmokeKit();
  const { prisma, cache, repos } = kit;

  try {
    await seed(prisma);
    cache.clear();

    let passed = 0;
    const failures: string[] = [];

    const cases: Case[] = [
      {
        name: 'owning 1:1 Profile.owner → User (custom FK ownerUid → uid)',
        run: async () => {
          const row = await repos.profile.getById({
            id: 'pr1',
            select: {
              id: true,
              bio: true,
              owner: { select: { uid: true, name: true } },
            },
          });
          assert.equal(row?.bio, 'mathematician');
          assert.deepEqual(row?.owner, { uid: 'u1', name: 'Ada' });
        },
      },
      {
        name: 'reverse 1:1 User.profile ← Profile.ownerUid',
        run: async () => {
          const row = await repos.user.getById({
            id: 'u1',
            select: {
              uid: true,
              name: true,
              profile: { select: { id: true, bio: true } },
            },
          });
          assert.equal(row?.profile?.id, 'pr1');
          assert.equal(row?.profile?.bio, 'mathematician');
        },
      },
      {
        name: 'N:1 dual relations Post.writer / Post.editor → same User model',
        run: async () => {
          const row = await repos.post.getById({
            id: 'p1',
            select: {
              postId: true,
              title: true,
              writer: { select: { name: true } },
              editor: { select: { name: true } },
            },
          });
          assert.equal(row?.writer?.name, 'Ada');
          assert.equal(row?.editor?.name, 'Bob');
        },
      },
      {
        name: '1:N User.posts (FK writerRef, PK uid — not id)',
        run: async () => {
          const row = await repos.user.getById({
            id: 'u1',
            select: {
              // omit uid intentionally — root PK must be injected
              name: true,
              posts: { select: { postId: true, title: true } },
            },
          });
          assert.equal(row?.posts?.length, 2);
          const ids = row!.posts.map((p: { postId: string }) => p.postId).sort();
          assert.deepEqual(ids, ['p1', 'p2']);
        },
      },
      {
        name: 'explicit m:n Post → postTags → tag',
        run: async () => {
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
          assert.equal(row?.postTags?.length, 2);
          const names = row!.postTags
            .map((pt: { tag: { name: string } }) => pt.tag.name)
            .sort();
          assert.deepEqual(names, ['node', 'ts']);
        },
      },
      {
        name: 'deep nest user → posts → category + postTags → tag',
        run: async () => {
          const row = await repos.user.getById({
            id: 'u1',
            select: {
              uid: true,
              posts: {
                select: {
                  postId: true,
                  category: { select: { code: true, label: true } },
                  postTags: {
                    select: { tag: { select: { name: true } } },
                  },
                },
              },
            },
          });
          const p1 = row!.posts.find((p: { postId: string }) => p.postId === 'p1');
          assert.deepEqual(p1.category, { code: 'tech', label: 'Technology' });
          assert.ok(p1.postTags.some((pt: any) => pt.tag.name === 'ts'));
        },
      },
      {
        name: 'non-PK reference Stock.warehouseCode → Warehouse.code',
        run: async () => {
          const row = await repos.stock.getById({
            id: 's1',
            select: {
              id: true,
              qty: true,
              warehouse: { select: { id: true, code: true, name: true } },
            },
          });
          assert.deepEqual(row?.warehouse, {
            id: 'w1',
            code: 'WH-A',
            name: 'Alpha',
          });
        },
      },
      {
        name: 'self-relation Comment.replies',
        run: async () => {
          const row = await repos.comment.getById({
            id: 'c1',
            select: {
              id: true,
              body: true,
              replies: { select: { id: true, body: true } },
            },
          });
          assert.equal(row?.replies?.length, 2);
        },
      },
      {
        name: 'nested take is per-parent (not global)',
        run: async () => {
          const rows = await repos.user.getMany({
            where: { uid: { in: ['u1', 'u2'] } },
            select: {
              uid: true,
              posts: {
                select: { postId: true },
                orderBy: { postId: 'asc' },
                take: 1,
              },
            },
          });
          // u2 has 0 posts as writer — only u1 has posts
          const u1 = rows.find((r: any) => r.uid === 'u1');
          assert.equal(u1.posts.length, 1);
          assert.equal(u1.posts[0].postId, 'p1');
        },
      },
      {
        name: 'setCache:false on parent does not cache relation fetches',
        run: async () => {
          cache.clear();
          await repos.post.getById({
            id: 'p1',
            select: {
              postId: true,
              writer: { select: { uid: true, name: true } },
            },
            setCache: false,
          });
          const userKeys = cache
            .keys?.() // MemoryCacheAdapter may not expose keys
            ? []
            : [];
          // Probe via second call + update: relation must re-read DB
          await prisma.user.update({
            where: { uid: 'u1' },
            data: { name: 'Ada Lovelace' },
          });
          const again = await repos.post.getById({
            id: 'p1',
            select: {
              postId: true,
              writer: { select: { uid: true, name: true } },
            },
            setCache: false,
          });
          assert.equal(again?.writer?.name, 'Ada Lovelace');
          // restore
          await prisma.user.update({
            where: { uid: 'u1' },
            data: { name: 'Ada' },
          });
          void userKeys;
        },
      },
      {
        name: 'entity cache hit + updateById invalidates stale getById',
        run: async () => {
          cache.clear();
          const first = await repos.user.getById({
            id: 'u2',
            select: { uid: true, name: true },
            setCache: true,
          });
          assert.equal(first?.name, 'Bob');

          await repos.user.updateById({
            id: 'u2',
            data: { name: 'Robert' },
            select: { uid: true, name: true },
          });

          const second = await repos.user.getById({
            id: 'u2',
            select: { uid: true, name: true },
            setCache: true,
          });
          assert.equal(second?.name, 'Robert');

          await repos.user.updateById({
            id: 'u2',
            data: { name: 'Bob' },
            select: { uid: true },
          });
        },
      },
      {
        name: 'updateMany default invalidate clears entity cache',
        run: async () => {
          cache.clear();
          await repos.user.getById({
            id: 'u2',
            select: { uid: true, name: true },
            setCache: true,
          });
          await repos.user.updateMany({
            where: { uid: 'u2' },
            data: { name: 'Bobby' },
          });
          const row = await repos.user.getById({
            id: 'u2',
            select: { uid: true, name: true },
            setCache: true,
          });
          assert.equal(row?.name, 'Bobby');
          await repos.user.updateById({
            id: 'u2',
            data: { name: 'Bob' },
            select: { uid: true },
          });
        },
      },
      {
        name: 'sibling parents do not share aliased relation objects',
        run: async () => {
          const rows = await repos.post.getMany({
            where: { postId: { in: ['p1', 'p2'] } },
            select: {
              postId: true,
              writer: { select: { uid: true, name: true } },
            },
          });
          assert.equal(rows[0].writer.uid, 'u1');
          assert.equal(rows[1].writer.uid, 'u1');
          assert.notEqual(rows[0].writer, rows[1].writer);
          rows[0].writer.name = 'MUTATED';
          assert.equal(rows[1].writer.name, 'Ada');
        },
      },
    ];

    section('PrismaKit smoke cases');
    for (const c of cases) {
      try {
        await c.run();
        passed += 1;
        console.log(`  ✓ ${c.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`${c.name}: ${msg}`);
        console.log(`  ✗ ${c.name}`);
        console.log(`      ${msg}`);
      }
    }

    console.log(`\n${passed}/${cases.length} passed`);
    if (failures.length) {
      console.error('\nFailures:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log('\nAll smoke checks passed — PrismaKit looks good on real Prisma.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
