import type { PrismaClient } from '@prisma/client';

/** Wipe and seed deterministic messy-schema fixtures. */
export async function seed(prisma: PrismaClient): Promise<void> {
  // Order matters for FKs (SQLite)
  await prisma.postTag.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { uid: 'u1', name: 'Ada' },
      { uid: 'u2', name: 'Bob' },
    ],
  });

  await prisma.profile.create({
    data: { id: 'pr1', bio: 'mathematician', ownerUid: 'u1' },
  });

  await prisma.category.create({
    data: { code: 'tech', label: 'Technology' },
  });

  await prisma.post.createMany({
    data: [
      {
        postId: 'p1',
        title: 'Hello',
        writerRef: 'u1',
        editorRef: 'u2',
        categoryCode: 'tech',
      },
      {
        postId: 'p2',
        title: 'World',
        writerRef: 'u1',
        editorRef: 'u1',
        categoryCode: 'tech',
      },
    ],
  });

  await prisma.tag.createMany({
    data: [
      { id: 't1', name: 'ts' },
      { id: 't2', name: 'node' },
    ],
  });

  await prisma.postTag.createMany({
    data: [
      { postId: 'p1', tagId: 't1' },
      { postId: 'p1', tagId: 't2' },
      { postId: 'p2', tagId: 't1' },
    ],
  });

  await prisma.warehouse.create({
    data: { id: 'w1', code: 'WH-A', name: 'Alpha' },
  });

  await prisma.stock.create({
    data: { id: 's1', qty: 42, warehouseCode: 'WH-A' },
  });

  await prisma.comment.createMany({
    data: [
      { id: 'c1', body: 'root', authorUid: 'u1', parentId: null },
      { id: 'c2', body: 'reply-1', authorUid: 'u2', parentId: 'c1' },
      { id: 'c3', body: 'reply-2', authorUid: 'u1', parentId: 'c1' },
    ],
  });
}
