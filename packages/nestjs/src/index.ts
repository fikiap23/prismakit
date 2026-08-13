/**
 * @prismakit/nestjs — NestJS integration for PrismaKit.
 *
 * Public surface:
 * - `PrismaKitModule.forRoot` / `forRootAsync`
 * - `TransactionService` (feature transactions)
 * - `createDefineRepo` / `createInjectableRepository`
 * - DI tokens (`PRISMAKIT_*`) — repositories / kit internals only
 *
 * Do **not** inject `PRISMAKIT_PRISMA` / PrismaClient in feature services,
 * helpers, controllers, or processors. Use repositories + TransactionService.
 */

export {
  PrismaKitModule,
  type PrismaKitModuleOptions,
  type PrismaKitModuleAsyncOptions,
  type NestTelemetryOptions,
} from './prismakit.module';
export {
  TransactionService,
  type PrismaClientWithTransaction,
  type TransactionOptions,
} from './transaction.service';
export { createInjectableRepository } from './injectable-repository';
export {
  createDefineRepo,
  type InjectableRepo,
  type DefineRepoDefaults,
  type ModelKeyOf,
} from './create-define-repo';
export {
  PRISMAKIT_PRISMA,
  PRISMAKIT_CACHE,
  PRISMAKIT_OPTIONS,
} from './tokens';
