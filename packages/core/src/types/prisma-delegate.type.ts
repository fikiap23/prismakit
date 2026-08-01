/**
 * Structural shim over Prisma model delegates.
 * Args use `any` (not `unknown`) so real Prisma delegates remain assignable —
 * their methods require specific shapes (e.g. `create` needs `data`), which are
 * not assignable to `(args: unknown)` under strictFunctionTypes / IDE checking.
 */
export type PrismaModelDelegate = {
  create: (args: any) => Promise<unknown>;
  createMany?: (args: any) => Promise<{ count: number }>;
  findUnique: (args: any) => Promise<unknown | null>;
  findUniqueOrThrow: (args: any) => Promise<unknown>;
  findFirst: (args: any) => Promise<unknown | null>;
  findMany: (args: any) => Promise<unknown[]>;
  update: (args: any) => Promise<unknown>;
  updateMany?: (args: any) => Promise<{ count: number }>;
  upsert?: (args: any) => Promise<unknown>;
  delete: (args: any) => Promise<unknown>;
  deleteMany?: (args: any) => Promise<{ count: number }>;
  count: (args: any) => Promise<number>;
};
