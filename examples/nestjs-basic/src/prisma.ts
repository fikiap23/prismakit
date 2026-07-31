/**
 * Tiny in-memory Prisma-like client for the example (no database required).
 * Swap for a real `PrismaClient` in production.
 */
const users = new Map([
  ['demo-user', { id: 'demo-user', email: 'ada@example.com', name: 'Ada' }],
]);

export const prisma = {
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
