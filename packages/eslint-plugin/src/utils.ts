import type { Rule } from 'eslint';
import path from 'node:path';

/** Paths that may use PrismaService / PrismaClient / delegates / $transaction. */
export function isAllowedPrismaPath(filename: string): boolean {
  const normalized = filename.replace(/\\/g, '/');
  return (
    /\/repositories\//.test(normalized) ||
    /\/infrastructure\/prisma\//.test(normalized) ||
    /\/node_modules\//.test(normalized) ||
    /packages\/(core|nestjs|redis)\//.test(normalized)
  );
}

export function isRepositoryPath(filename: string): boolean {
  return /\/repositories\//.test(filename.replace(/\\/g, '/'));
}

export function relativeDisplay(filename: string): string {
  try {
    return path.relative(process.cwd(), filename) || filename;
  } catch {
    return filename;
  }
}

export const PRISMA_DELEGATE_METHODS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

export type SimpleRuleModule = Rule.RuleModule;
