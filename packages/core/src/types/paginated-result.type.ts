export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export type CursorPage<T> = {
  data: T[];
  nextCursor: unknown | null;
  hasMore: boolean;
};
