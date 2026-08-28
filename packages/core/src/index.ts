// Factory
export {
  createRepository,
  type RepositoryOptions,
  type RepositoryOptionsFromTypes,
  type RepositoryDeps,
  type RepositoryInstance,
  type RepositoryInstanceFromTypes,
  type RepositoryApiFromTypes,
  type RepositoryCtorFromTypes,
  type PrismaClientLike,
  type DefaultToPayload,
} from './create-repository';

export type {
  RepositoryApi,
} from './types/repository-api.type';

export type {
  RepositoryApiFromTypeMap,
  HasCacheFromOptions,
  RepositoryOf,
} from './types/repository-api-typemap.type';

export type {
  PrismaTypeMapLike,
  TypeMapArgs,
  TypeMapSelect,
  TypeMapCreateInput,
  TypeMapCreateManyInput,
  TypeMapCreateManyAndReturnInput,
  TypeMapUpdateInput,
  TypeMapUpdateManyInput,
  TypeMapUpdateManyAndReturnArgs,
  TypeMapWhereInput,
  TypeMapWhereUniqueInput,
  TypeMapOrderByInput,
  TypeMapCountArgs,
  TypeMapAggregateArgs,
  TypeMapAggregateResult,
  TypeMapGroupByArgs,
  TypeMapGroupByResult,
  TypeMapCursor,
  TypeMapGetPayload,
  CamelToPascal,
  PascalToCamel,
} from './types/prisma-typemap.type';

// Tagged JSON codec (Date / Decimal / Bytes / BigInt)
export {
  cloneWithCodec,
  createTaggedJsonReviver,
  getTaggedJsonOptions,
  setTaggedJsonOptions,
  taggedJsonParse,
  taggedJsonReplacer,
  taggedJsonStringify,
  type DecimalFactory,
  type TaggedJsonOptions,
} from './codec/tagged-json';

// Cache
export type { CacheAdapter } from './cache/cache-adapter.interface';
export type {
  CacheMethod,
  CacheOptions,
  InvalidateMode,
} from './types/cache-options.type';
export type {
  StampedeOptions,
  StampedeBackoff,
} from './types/stampede-options.type';
export {
  type CacheDebugStatus,
  cacheDebugStorage,
  isCacheDebugEnabled,
  recordCacheDebug,
} from './cache/cache-debug.util';

// Compose
export { AutoComposer } from './auto-composer';
export {
  setComposeOptions,
  type ComposeOptions,
} from './compose/compose-options';
export {
  RepositoryRegistry,
  type RegisteredRepository,
} from './repository-registry';
export {
  validateSelectCompose,
  assertSelectComposeValid,
  type ComposeValidationIssue,
  type ValidateSelectComposeOptions,
} from './compose/validate-select-compose';

// Lock (types only)
export type {
  RowLockMode,
  RowLockOptions,
  RepositoryLockConfig,
} from './types/row-lock-options.type';

// Schema / meta boot
export {
  loadPrismaMetaFromDmmf,
  loadPrismaMetaFromSchema,
  ensurePrismaMeta,
  clearPrismaMeta,
  setPrismaMeta,
  getPrismaMeta,
  getModelMeta,
  type PrismaMetaRegistry,
  type ModelMeta,
  type RelationMeta,
  type RelationKind,
  type PrismaDmmfLike,
  type DmmfDatamodelLike,
  type DmmfModelLike,
  type DmmfFieldLike,
} from './schema/prisma-meta';

// Pagination result types
export type { CursorPage, PaginatedResult } from './types/paginated-result.type';

// Errors
export {
  PrismaKitError,
  RecordNotFoundError,
  UniqueConstraintError,
  ForeignKeyError,
  LockNotAvailableError,
  UnsupportedProviderError,
  wrapPrismaError,
} from './errors';

// Telemetry
export {
  setTelemetry,
  type TelemetryEvent,
  type TelemetryHandler,
  type TelemetryOptions,
  type CacheTelemetryEvent,
  type ComposeTelemetryEvent,
  type LockTelemetryEvent,
  type StampedeTelemetryEvent,
  type QueryTelemetryEvent,
} from './telemetry/telemetry';
