// Factory
export {
  createRepository,
  createPrismaRepository,
  type RepositoryOptions,
  type RepositoryOptionsFromTypes,
  type RepositoryDeps,
  type RepositoryInstance,
  type RepositoryInstanceFromTypes,
  type RepositoryApiFromTypes,
  type RepositoryCtorFromTypes,
  type PrismaRepositoryInstance,
  type PrismaClientLike,
  type DefaultToPayload,
} from './create-repository';

export type {
  RepoPayloadHKT,
  ApplyRepoPayload,
  RepoTypesDefinition,
  ToPayloadFromTypes,
  PayloadFromTypes,
} from './types/repo-types.type';

export type {
  RepositoryApi,
} from './types/repository-api.type';

// Cache
export type { CacheAdapter } from './cache/cache-adapter.interface';
export type {
  CacheMethod,
  CacheOptions,
  RepositoryCacheOptions,
  InvalidateMode,
} from './types/cache-options.type';
export {
  setRegisteredCacheModels,
  getRegisteredCacheModels,
  validateCacheConfig,
} from './cache/validate-cache-config';
export {
  buildEntityKey,
  buildQueryKey,
  entityIndexKey,
  queryIndexKey,
} from './cache/cache-key.util';
export { selectIncludesSensitiveField } from './cache/cache-guard.util';
export { applyJitter } from './cache/ttl-jitter.util';
export { stableHash } from './cache/stable-hash.util';
export {
  type CacheDebugStatus,
  cacheDebugStorage,
  isCacheDebugEnabled,
  recordCacheDebug,
} from './cache/cache-debug.util';

// Compose
export { AutoComposer } from './auto-composer';
export {
  RepositoryRegistry,
  type RegisteredRepository,
} from './repository-registry';
export {
  resolveRelationModel,
  buildRelationModelCandidates,
  setRelationModelAliases,
  mergeRelationModelAliases,
  getRelationModelAliases,
  RELATION_MODEL_ALIASES,
  RELATION_MODEL_SUFFIX_RULES,
} from './compose/relation-resolver';
export {
  computeRelationAliasesFromSchema,
  candidatesWithoutAliases,
} from './compose/relation-alias-codegen';
export {
  validateSelectCompose,
  assertSelectComposeValid,
  type ComposeValidationIssue,
  type ValidateSelectComposeOptions,
} from './compose/validate-select-compose';

// Lock
export {
  buildLockClause,
  selectToDbColumns,
  mapDbRowToPrisma,
  assertLockPrerequisites,
  queryRowForUpdate,
} from './lock/row-lock';
export { buildLockConfigFromSchema } from './lock/build-lock-config';
export { validateLockConfig } from './lock/validate-lock-config';
export type {
  RowLockMode,
  RowLockOptions,
  RepositoryLockConfig,
} from './types/row-lock-options.type';

// Schema
export {
  parsePrismaSchema,
  getSchemaModels,
  findModelByTableName,
  getScalarFields,
  getRelationFields,
  expectedDbColumn,
  pascalToRepoKey,
  type SchemaField,
  type SchemaFieldKind,
  type SchemaModel,
} from './schema/parse-prisma-schema';

// Pagination
export { paginator, type PaginateOptions, type PaginateFunction } from './pagination/paginator';
export type { PaginatedResult } from './types/paginated-result.type';
/** @deprecated Use PaginatedResult */
export type { PaginatedResult as IPaginatedResult } from './types/paginated-result.type';

// Utils
export { splitSelect } from './utils/split-select';

// Types
export type { PrismaModelDelegate } from './types/prisma-delegate.type';
export type { InferRepositoryPayload } from './types/infer-repository-payload.type';
