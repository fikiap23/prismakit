/**
 * Base error for all PrismaKit runtime failures.
 * Consumers can `instanceof PrismaKitError` without depending on Prisma codes.
 */
export class PrismaKitError extends Error {
  readonly code?: string;
  readonly cause?: unknown;

  constructor(message: string, options?: { code?: string; cause?: unknown }) {
    super(message);
    this.name = 'PrismaKitError';
    this.code = options?.code;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown by getThrow* when no row matches (Prisma P2025). */
export class RecordNotFoundError extends PrismaKitError {
  readonly model?: string;
  readonly where?: unknown;

  constructor(
    message = 'Record not found',
    options?: { model?: string; where?: unknown; cause?: unknown },
  ) {
    super(message, { code: 'P2025', cause: options?.cause });
    this.name = 'RecordNotFoundError';
    this.model = options?.model;
    this.where = options?.where;
  }
}

/** Unique constraint violation (Prisma P2002). */
export class UniqueConstraintError extends PrismaKitError {
  readonly target?: string[];

  constructor(
    message = 'Unique constraint failed',
    options?: { target?: string[]; cause?: unknown },
  ) {
    super(message, { code: 'P2002', cause: options?.cause });
    this.name = 'UniqueConstraintError';
    this.target = options?.target;
  }
}

/** Foreign key constraint violation (Prisma P2003). */
export class ForeignKeyError extends PrismaKitError {
  readonly field?: string;

  constructor(
    message = 'Foreign key constraint failed',
    options?: { field?: string; cause?: unknown },
  ) {
    super(message, { code: 'P2003', cause: options?.cause });
    this.name = 'ForeignKeyError';
    this.field = options?.field;
  }
}

/** Row lock could not be acquired (Postgres 55P03 / NOWAIT). */
export class LockNotAvailableError extends PrismaKitError {
  constructor(
    message = 'Could not acquire row lock',
    options?: { cause?: unknown },
  ) {
    super(message, { code: '55P03', cause: options?.cause });
    this.name = 'LockNotAvailableError';
  }
}

/** Feature requires a specific Prisma datasource provider. */
export class UnsupportedProviderError extends PrismaKitError {
  readonly provider?: string;
  readonly feature?: string;

  constructor(
    message: string,
    options?: { provider?: string; feature?: string; cause?: unknown },
  ) {
    super(message, { code: 'UNSUPPORTED_PROVIDER', cause: options?.cause });
    this.name = 'UnsupportedProviderError';
    this.provider = options?.provider;
    this.feature = options?.feature;
  }
}

type PrismaLikeError = {
  code?: string;
  meta?: { target?: string[] | string; field_name?: string };
  message?: string;
};

/**
 * Map a raw Prisma / driver error into a typed {@link PrismaKitError}.
 * Returns the original value when it is not a recognized Prisma error.
 */
export function wrapPrismaError(
  err: unknown,
  context?: { model?: string; where?: unknown },
): never | unknown {
  if (err instanceof PrismaKitError) throw err;

  const e = err as PrismaLikeError;
  const code = e?.code;

  if (code === 'P2025') {
    throw new RecordNotFoundError(
      e.message ?? `Record not found${context?.model ? ` (${context.model})` : ''}`,
      { model: context?.model, where: context?.where, cause: err },
    );
  }
  if (code === 'P2002') {
    const target = Array.isArray(e.meta?.target)
      ? e.meta.target
      : typeof e.meta?.target === 'string'
        ? [e.meta.target]
        : undefined;
    throw new UniqueConstraintError(e.message ?? 'Unique constraint failed', {
      target,
      cause: err,
    });
  }
  if (code === 'P2003') {
    throw new ForeignKeyError(e.message ?? 'Foreign key constraint failed', {
      field: e.meta?.field_name,
      cause: err,
    });
  }
  if (
    code === '55P03' ||
    (typeof e.message === 'string' &&
      /could not obtain lock|lock not available|NOWAIT/i.test(e.message))
  ) {
    throw new LockNotAvailableError(e.message ?? 'Could not acquire row lock', {
      cause: err,
    });
  }

  throw err;
}
