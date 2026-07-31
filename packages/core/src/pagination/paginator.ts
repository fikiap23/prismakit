import type { PaginatedResult } from '../types/paginated-result.type';

export type PaginateOptions = {
  page?: number | string;
  perPage?: number | string;
};

export type PaginateFunction = <T, K>(
  model: {
    count: (args: { where?: unknown }) => Promise<number>;
    findMany: (args: unknown) => Promise<T[]>;
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

    const skip = page > 0 ? pageSize * (page - 1) : 0;
    const [totalItems, data] = await Promise.all([
      model.count({ where: args.where }),
      model.findMany({
        ...args,
        take: pageSize,
        skip,
      }),
    ]);
    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      data,
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  };
};
