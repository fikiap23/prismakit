/**
 * Express + PrismaKit without Nest.
 *
 * Uses an in-memory Prisma-like stub so the example runs without Postgres.
 * In production, pass a real `PrismaClient` instead of `prisma` below.
 */
import express from 'express';
import { createRepository } from '@prismakit/core';
import { MemoryCacheAdapter } from '@prismakit/memory';

const users = new Map([
  ['demo-user', { id: 'demo-user', email: 'ada@example.com', name: 'Ada' }],
]);

/** Minimal delegate shape expected by createRepository (findUnique*). */
const prisma = {
  user: {
    async findUnique(args: { where: { id: string }; select?: object }) {
      const row = users.get(args.where.id) ?? null;
      if (!row || !args.select) return row;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(args.select)) {
        if ((args.select as Record<string, boolean>)[key]) {
          out[key] = (row as Record<string, unknown>)[key];
        }
      }
      return out;
    },
    async findUniqueOrThrow(args: { where: { id: string }; select?: object }) {
      const row = await this.findUnique(args);
      if (!row) throw new Error(`User ${args.where.id} not found`);
      return row;
    },
  },
};

const UserRepository = createRepository({
  model: 'user',
  cache: { ttl: 60 },
});

const cache = new MemoryCacheAdapter({ prefix: 'express-example', maxSize: 100 });
const userRepo = new UserRepository({ prisma, cache });

const app = express();
const port = Number(process.env.PORT ?? 3002);

app.get('/users/:id', async (req, res) => {
  try {
    const user = await userRepo.getThrowById({
      id: req.params.id,
      select: { id: true, email: true, name: true },
      setCache: true,
    });
    res.json(user);
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : 'Not found',
    });
  }
});

app.listen(port, () => {
  console.log(`PrismaKit Express example on http://localhost:${port}`);
  console.log(`Try: curl http://localhost:${port}/users/demo-user`);
});
