/**
 * @prismakit/nestjs — NestJS integration for PrismaKit.
 *
 * Public surface:
 * - `PrismaKitModule.forRoot` / `forRootAsync`
 * - `TransactionService` (feature transactions)
 * - `createInjectableRepository` / `createPrismaRepository`
 * - DI tokens (`PRISMAKIT_*`)
 *
 * Do **not** inject `PRISMAKIT_PRISMA` / PrismaClient in feature services,
 * helpers, controllers, or processors. Use repositories + TransactionService.
 * The prisma token exists only so InjectableRepository can wire RepositoryDeps.
 */

export {
  PrismaKitModule,
  type PrismaKitModuleOptions,
  type PrismaKitModuleAsyncOptions,
} from './prismakit.module';
export {
  TransactionService,
  type PrismaClientWithTransaction,
} from './transaction.service';
export {
  createInjectableRepository,
  createPrismaRepository,
} from './injectable-repository';
export {
  PRISMAKIT_PRISMA,
  PRISMAKIT_CACHE,
  PRISMAKIT_OPTIONS,
} from './tokens';

/** Re-exports commonly needed from core for consumer convenience. */
export {
  AutoComposer,
  RepositoryRegistry,
  type CacheAdapter,
  type RepositoryOptions,
  type RepositoryInstance,
  type PrismaRepositoryInstance,
  type PrismaClientLike,
  type DefaultToPayload,
} from '@prismakit/core';
