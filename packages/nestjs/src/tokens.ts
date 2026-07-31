/**
 * DI tokens for PrismaKit NestJS integration.
 *
 * `PRISMAKIT_PRISMA` is **internal** — only InjectableRepository / kit internals
 * should inject it. Feature modules (services, helpers, controllers) must use
 * repositories and TransactionService instead.
 */
export const PRISMAKIT_PRISMA = Symbol('PRISMAKIT_PRISMA');
export const PRISMAKIT_CACHE = Symbol('PRISMAKIT_CACHE');
export const PRISMAKIT_OPTIONS = Symbol('PRISMAKIT_OPTIONS');
