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
  type TransactionOptions,
} from './transaction.service';
export {
  createInjectableRepository,
  createPrismaRepository,
} from './injectable-repository';
export {
  defineInjectableRepository,
  defineRepo,
  defineRepository,
} from './define-repository';
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

/** Re-exports commonly needed from core for consumer convenience. */
export {
  AutoComposer,
  RepositoryRegistry,
  type CacheAdapter,
  type RepositoryOptions,
  type RepositoryOptionsFromTypes,
  type RepositoryInstance,
  type RepositoryInstanceFromTypes,
  type RepositoryApi,
  type RepositoryApiFromTypes,
  type RepositoryApiFromTypeMap,
  type RepositoryOf,
  type HasCacheFromOptions,
  type PrismaTypeMapLike,
  type CamelToPascal,
  type PrismaRepositoryInstance,
  type PrismaClientLike,
  type DefaultToPayload,
  type RepoPayloadHKT,
  type ApplyRepoPayload,
  type RepoTypesDefinition,
  type ToPayloadFromTypes,
  type PayloadFromTypes,
  type ComposeOptions,
  type TelemetryOptions,
  type TelemetryEvent,
  loadPrismaMetaFromDmmf,
  loadPrismaMetaFromSchema,
  setComposeOptions,
  setTelemetry,
  getTelemetrySlowThreshold,
  type PrismaDmmfLike,
} from '@prismakit/core';
