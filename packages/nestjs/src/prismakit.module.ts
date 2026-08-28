import {
  DynamicModule,
  Global,
  Inject,
  Module,
  OnApplicationBootstrap,
  OnModuleInit,
  Optional,
  Provider,
  Type,
} from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import {
  assertSelectComposeValid,
  AutoComposer,
  createRepository,
  ensurePrismaMeta,
  getPrismaMeta,
  loadPrismaMetaFromDmmf,
  loadPrismaMetaFromSchema,
  setComposeOptions,
  setTaggedJsonOptions,
  setTelemetry,
  type CacheAdapter,
  type ComposeOptions,
  type DecimalFactory,
  type PrismaClientLike,
  type PrismaDmmfLike,
  type TelemetryEvent,
  type TelemetryOptions,
  RepositoryRegistry,
} from '@prismakit/core';

import {
  PRISMAKIT_CACHE,
  PRISMAKIT_OPTIONS,
  PRISMAKIT_PRISMA,
} from './tokens';
import {
  assertCachedRepoProviders,
  assertDuplicateRepoProviders,
  assertUniqueRepoInstances,
} from './assert-cached-repo-providers';
import {
  collectLiveRepoProviders,
  inheritRepoInjection,
} from './inherit-repo-inject';
import { TransactionService } from './transaction.service';

const DEFAULT_SCHEMA_PATH = 'prisma/schema.prisma';

export type NestTelemetryOptions = TelemetryOptions & {
  /**
   * Convenience callback for `query.slow` events.
   * Setting this (or `slowThreshold`) enables telemetry unless `enabled: false`.
   */
  onSlowQuery?: (event: {
    model?: string;
    method?: string;
    durationMs: number;
    thresholdMs: number;
  }) => void;
};

export type PrismaKitModuleOptions = {
  /** Prisma client instance. Provided via `PRISMAKIT_PRISMA` for repositories only. */
  prisma: PrismaClientLike;
  /** Optional cache backend (e.g. RedisCacheAdapter / MemoryCacheAdapter). */
  cache?: CacheAdapter;
  /**
   * Prisma DMMF (`Prisma.dmmf` on Prisma 5/6). Optional on Prisma 7 —
   * prefer `schemaPath` which loads relation FKs from `schema.prisma`.
   */
  dmmf?: PrismaDmmfLike;
  /**
   * When set (and `dmmf` is omitted), load Prisma meta from this schema file
   * so auto-compose / locks get free FK naming.
   * Defaults to `prisma/schema.prisma`.
   */
  schemaPath?: string;
  /** When true, run assertSelectComposeValid on module init. */
  validateCompose?: boolean;
  /** Global auto-compose options (maxDepth, parallel, setCache). */
  compose?: ComposeOptions;
  /** Telemetry / slow-query hooks. */
  telemetry?: NestTelemetryOptions;
  /**
   * Reconstruct Prisma `Decimal` after Redis / compose JSON clone.
   * Without this, Decimal fields come back as strings.
   * @example decimalFactory: (s) => new Prisma.Decimal(s)
   */
  decimalFactory?: DecimalFactory;
  /**
   * Auto-register read-only stub repositories for models that lack an explicit
   * Nest provider — eliminates compose-only stub repos.
   *
   * - `true` — register all models from loaded Prisma meta
   * - `string[]` — register only these client keys (e.g. `['productImage']`)
   */
  autoRegisterModels?: boolean | readonly string[];
  /**
   * Fail boot when a repository class has `cache` in source but is not a Nest
   * provider, or the same class is listed in two modules' `providers`.
   * Default `true`. Set `false` to keep the previous silent-stub behaviour.
   */
  strictCachedRepos?: boolean;
  /**
   * Feature-modules directory scanned by `strictCachedRepos`.
   * Default: `src/modules` (and `build/compile/src/modules` in production images).
   */
  modulesRoot?: string;
};

export type PrismaKitModuleAsyncOptions = {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  useFactory: (
    ...args: unknown[]
  ) => Promise<PrismaKitModuleOptions> | PrismaKitModuleOptions;
  inject?: unknown[];
};

function wireTelemetry(options: PrismaKitModuleOptions): void {
  const tel = options.telemetry;
  if (!tel) return;

  const onSlowQuery = tel.onSlowQuery;
  const threshold = tel.slowThreshold ?? (onSlowQuery ? 500 : undefined);
  const enabled =
    tel.enabled === true ||
    tel.onEvent != null ||
    onSlowQuery != null ||
    threshold != null;

  if (!enabled || tel.enabled === false) {
    if (tel.enabled === false) {
      setTelemetry({ enabled: false });
    }
    return;
  }

  setTelemetry({
    enabled: true,
    slowThreshold: threshold,
    onEvent: (event: TelemetryEvent) => {
      tel.onEvent?.(event);
      if (onSlowQuery && event.type === 'query.slow') {
        onSlowQuery({
          model: event.model,
          method: event.method,
          durationMs: event.durationMs,
          thresholdMs: event.thresholdMs ?? threshold ?? 500,
        });
      }
    },
  });
}

let warnedMissingDefaultSchema = false;

function resolvedSchemaPath(options: PrismaKitModuleOptions): string {
  return options.schemaPath ?? DEFAULT_SCHEMA_PATH;
}

function applyModuleOptions(options: PrismaKitModuleOptions): void {
  if (options.dmmf) {
    loadPrismaMetaFromDmmf(options.dmmf);
  } else {
    const schemaPath = resolvedSchemaPath(options);
    const loaded = ensurePrismaMeta({ schemaPath });
    if (!loaded) {
      if (options.schemaPath) {
        loadPrismaMetaFromSchema(options.schemaPath);
      } else if (!warnedMissingDefaultSchema) {
        warnedMissingDefaultSchema = true;
        console.warn(
          `[PrismaKit] ${DEFAULT_SCHEMA_PATH} not found; auto-compose requires schemaPath or dmmf`,
        );
      }
    }
  }
  if (options.compose) {
    setComposeOptions(options.compose);
  }
  if (options.decimalFactory) {
    setTaggedJsonOptions({ decimalFactory: options.decimalFactory });
  }
  wireTelemetry(options);
}

function autoRegisterStubRepos(
  registry: RepositoryRegistry,
  prisma: PrismaClientLike,
  options: PrismaKitModuleOptions,
): void {
  if (!options.autoRegisterModels) return;

  let models: string[] = [];
  if (Array.isArray(options.autoRegisterModels)) {
    models = [...options.autoRegisterModels];
  } else {
    const meta = getPrismaMeta();
    if (!meta) {
      console.warn(
        '[PrismaKit] autoRegisterModels: true requires schemaPath/dmmf so Prisma meta is loaded',
      );
      return;
    }
    models = Object.keys(meta);
  }

  for (const model of models) {
    if (registry.get(model)) continue;
    if (prisma[model] == null) continue;

    const Repo = createRepository({ model });
    new Repo({
      prisma,
      cache: options.cache,
      registry,
      autoCompose: new AutoComposer(registry),
    });
  }
}

@Global()
@Module({})
export class PrismaKitModule implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    @Optional()
    @Inject(PRISMAKIT_OPTIONS)
    private readonly options?: PrismaKitModuleOptions,
    // Explicit @Inject required: tsup/esbuild does not emit design:paramtypes,
    // so Nest cannot resolve class tokens from TypeScript types alone.
    @Optional()
    @Inject(RepositoryRegistry)
    private readonly registry?: RepositoryRegistry,
    @Optional()
    @Inject(ModulesContainer)
    private readonly modulesContainer?: ModulesContainer,
  ) {}

  onModuleInit(): void {
    if (this.modulesContainer) {
      inheritRepoInjection(this.modulesContainer);
    }
    if (this.options) {
      applyModuleOptions(this.options);
      if (this.registry && this.options.prisma) {
        autoRegisterStubRepos(
          this.registry,
          this.options.prisma,
          this.options,
        );
      }
    }
    if (!this.options?.validateCompose) return;
    assertSelectComposeValid(process.cwd(), {
      schemaPath: resolvedSchemaPath(this.options),
      autoRegisterModels: this.options.autoRegisterModels,
    });
  }

  onApplicationBootstrap(): void {
    if (this.options?.strictCachedRepos === false) return;
    const projectRoot = process.cwd();
    const modulesRoot = this.options?.modulesRoot;
    assertDuplicateRepoProviders({ projectRoot, modulesRoot });
    if (!this.modulesContainer) return;
    const live = collectLiveRepoProviders(this.modulesContainer);
    assertCachedRepoProviders({
      projectRoot,
      modulesRoot,
      cachedModels: live.cachedModels,
      classNames: live.classNames,
    });
    assertUniqueRepoInstances(live.instancesByModel);
  }

  /**
   * Register PrismaKit globally.
   *
   * Exports `TransactionService`, `RepositoryRegistry`, `AutoComposer`, and
   * injection tokens. Does **not** export a raw PrismaService / PrismaClient
   * for feature modules — inject repositories and TransactionService only.
   * `PRISMAKIT_PRISMA` is available for InjectableRepository internals.
   */
  static forRoot(options: PrismaKitModuleOptions): DynamicModule {
    applyModuleOptions(options);
    return {
      module: PrismaKitModule,
      global: true,
      providers: this.buildProviders(options),
      exports: this.buildExports(),
    };
  }

  static forRootAsync(asyncOptions: PrismaKitModuleAsyncOptions): DynamicModule {
    const asyncProviders: Provider[] = [
      {
        provide: PRISMAKIT_OPTIONS,
        useFactory: async (...args: unknown[]) => {
          const opts = await asyncOptions.useFactory(...args);
          applyModuleOptions(opts);
          return opts;
        },
        inject: (asyncOptions.inject ?? []) as never[],
      },
      {
        provide: PRISMAKIT_PRISMA,
        useFactory: (opts: PrismaKitModuleOptions) => opts.prisma,
        inject: [PRISMAKIT_OPTIONS],
      },
      {
        provide: PRISMAKIT_CACHE,
        useFactory: (opts: PrismaKitModuleOptions) => opts.cache,
        inject: [PRISMAKIT_OPTIONS],
      },
      RepositoryRegistry,
      {
        provide: AutoComposer,
        useFactory: (registry: RepositoryRegistry) =>
          new AutoComposer(registry),
        inject: [RepositoryRegistry],
      },
      TransactionService,
    ];

    return {
      module: PrismaKitModule,
      global: true,
      imports: asyncOptions.imports ?? [],
      providers: asyncProviders,
      exports: this.buildExports(),
    };
  }

  private static buildProviders(options: PrismaKitModuleOptions): Provider[] {
    const providers: Provider[] = [
      { provide: PRISMAKIT_OPTIONS, useValue: options },
      { provide: PRISMAKIT_PRISMA, useValue: options.prisma },
      RepositoryRegistry,
      {
        provide: AutoComposer,
        useFactory: (registry: RepositoryRegistry) =>
          new AutoComposer(registry),
        inject: [RepositoryRegistry],
      },
      TransactionService,
    ];

    if (options.cache) {
      providers.push({ provide: PRISMAKIT_CACHE, useValue: options.cache });
    }

    return providers;
  }

  private static buildExports(): Array<
    string | symbol | Type<unknown> | DynamicModule | Provider
  > {
    return [
      TransactionService,
      RepositoryRegistry,
      AutoComposer,
      PRISMAKIT_OPTIONS,
      PRISMAKIT_PRISMA,
      PRISMAKIT_CACHE,
    ];
  }
}
