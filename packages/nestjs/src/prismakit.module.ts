import {
  DynamicModule,
  Global,
  Inject,
  Module,
  OnModuleInit,
  Optional,
  Provider,
  Type,
} from '@nestjs/common';
import {
  assertSelectComposeValid,
  AutoComposer,
  setRegisteredCacheModels,
  type CacheAdapter,
  type PrismaClientLike,
  RepositoryRegistry,
} from '@prismakit/core';

import {
  PRISMAKIT_CACHE,
  PRISMAKIT_OPTIONS,
  PRISMAKIT_PRISMA,
} from './tokens';
import { TransactionService } from './transaction.service';

export type PrismaKitModuleOptions = {
  /** Prisma client instance. Provided via `PRISMAKIT_PRISMA` for repositories only. */
  prisma: PrismaClientLike;
  /** Optional cache backend (e.g. RedisCacheAdapter). */
  cache?: CacheAdapter;
  /** Path to prisma/schema.prisma for lock/cache validation helpers. */
  schemaPath?: string;
  /** When true, run assertSelectComposeValid on module init. */
  validateCompose?: boolean;
  /**
   * Strict cache-model allowlist. When set, repository `cache` config is only
   * allowed for these model keys. Omit for fail-open (no allowlist check).
   */
  cacheModels?: readonly string[];
};

export type PrismaKitModuleAsyncOptions = {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  useFactory: (
    ...args: unknown[]
  ) => Promise<PrismaKitModuleOptions> | PrismaKitModuleOptions;
  inject?: unknown[];
};

function applyCacheModels(options: PrismaKitModuleOptions): void {
  if (options.cacheModels) {
    setRegisteredCacheModels(options.cacheModels);
  }
}

@Global()
@Module({})
export class PrismaKitModule implements OnModuleInit {
  constructor(
    @Optional()
    @Inject(PRISMAKIT_OPTIONS)
    private readonly options?: PrismaKitModuleOptions,
  ) {}

  onModuleInit(): void {
    if (this.options) {
      applyCacheModels(this.options);
    }
    if (!this.options?.validateCompose) return;
    assertSelectComposeValid(process.cwd());
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
    applyCacheModels(options);
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
          applyCacheModels(opts);
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
