import type { PaginatedResult } from '../types/paginated-result.type';

export type PaginateOptions = {
  page?: number | string;
  perPage?: number | string;
  /**
   * When true and the model client exposes `$transaction`, run `count` +
   * `findMany` inside one interactive transaction so totals match the page.
   */
  consistent?: boolean;
};

export type PaginateFunction = <T, K>(
  model: {
    count: (args: { where?: unknown }) => Promise<number>;
    findMany: (args: unknown) => Promise<T[]>;
    $transaction?: <R>(fn: (tx: unknown) => Promise<R>) => Promise<R>;
  },
  args?: K,
  options?: PaginateOptions,
) => Promise<PaginatedResult<T>>;

export const paginator = (
  defaultOptions: PaginateOptions,
): PaginateFunction => {
  return async (model, args: any = { where: undefined }, options) => {
    const page = Number(options?.page || defaultOptions?.page) || 1;
    const pageSize = Number(options?.perPage || defaultOptions?.perPage) || 25;
    const consistent =
      options?.consistent === true || defaultOptions?.consistent === true;

    const skip = page > 0 ? pageSize * (page - 1) : 0;

    const run = async (delegate: {
      count: (args: { where?: unknown }) => Promise<number>;
      findMany: (args: unknown) => Promise<unknown[]>;
    }) => {
      const [totalItems, data] = await Promise.all([
        delegate.count({ where: args.where }),
        delegate.findMany({
          ...args,
          take: pageSize,
          skip,
        }),
      ]);
      return { totalItems, data: data as Awaited<ReturnType<typeof delegate.findMany>> };
    };

    let totalItems: number;
    let data: unknown[];

    if (consistent && typeof model.$transaction === 'function') {
      const result = await model.$transaction(async (tx) => {
        const txModel = tx as typeof model;
        return run(txModel);
      });
      totalItems = result.totalItems;
      data = result.data;
    } else {
      const result = await run(model);
      totalItems = result.totalItems;
      data = result.data;
    }

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      data: data as never[],
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  };
};
