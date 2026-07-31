export type RowLockMode = 'update' | 'noKeyUpdate' | 'share' | 'keyShare';

export type RowLockOptions = {
  mode?: RowLockMode;
  nowait?: boolean;
  skipLocked?: boolean;
};

export type RepositoryLockConfig = {
  tableName: string;
  columns?: Record<string, string>;
};
