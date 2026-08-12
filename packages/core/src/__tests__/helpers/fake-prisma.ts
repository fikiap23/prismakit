export type RawCall = { sql: string; values: unknown[] };
export type DelegateCall = {
  model: string;
  method: string;
  args: Record<string, unknown>;
};

type Row = Record<string, unknown>;

function project(row: Row, select?: Record<string, unknown>): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) out[k] = row[k];
  }
  return out;
}

function matchWhere(row: Row, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (key === 'OR' && Array.isArray(value)) {
      if (!value.some((clause) => matchWhere(row, clause as Row))) return false;
      continue;
    }
    if (key === 'AND' && Array.isArray(value)) {
      if (!value.every((clause) => matchWhere(row, clause as Row))) return false;
      continue;
    }
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if ('in' in obj && Array.isArray(obj.in)) {
        if (!obj.in.includes(row[key])) return false;
        continue;
      }
      if ('equals' in obj) {
        if (row[key] !== obj.equals) return false;
        continue;
      }
      if ('not' in obj) {
        if (row[key] === obj.not) return false;
        continue;
      }
      // Prisma compound unique: { tenantId_orderNo: { tenantId, orderNo } }
      if (
        Object.keys(obj).length > 0 &&
        Object.values(obj).every(
          (v) => v === null || typeof v !== 'object',
        )
      ) {
        if (!matchWhere(row, obj)) return false;
        continue;
      }
      // unknown filter shape — treat as equality on nested fields not supported
      return false;
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function applyOrderBy(rows: Row[], orderBy?: unknown): Row[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [[field, dir]] = Object.entries(clause as Row);
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp = av! < bv! ? -1 : 1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

export type FakeModelStore = {
  rows: Row[];
  /** Optional primary key field names (default ['id']). */
  primaryKey?: string | string[];
};

export type FakePrismaOptions = {
  models: Record<string, FakeModelStore>;
  /**
   * Custom raw handler. Default returns [] and records the call.
   * Return rows in DB column shape (caller/mapDbRowToPrisma remaps).
   */
  onRaw?: (sql: string, values: unknown[]) => Row[] | Promise<Row[]>;
};

export type FakePrismaClient = {
  [model: string]: unknown;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $transaction: <T>(fn: (tx: FakePrismaClient) => Promise<T>) => Promise<T>;
  __calls: DelegateCall[];
  __rawCalls: RawCall[];
  __resetCalls: () => void;
  __getRows: (model: string) => Row[];
  __setRows: (model: string, rows: Row[]) => void;
};

function createDelegate(
  model: string,
  store: FakeModelStore,
  calls: DelegateCall[],
) {
  const pk = store.primaryKey ?? 'id';
  const pkFields = Array.isArray(pk) ? pk : [pk];

  const findByWhere = (where: Row | undefined): Row | undefined => {
    if (!where) return undefined;
    return store.rows.find((r) => matchWhere(r, where));
  };

  return {
    async findMany(args: {
      where?: Row;
      select?: Row;
      orderBy?: unknown;
      take?: number;
      skip?: number;
    } = {}) {
      calls.push({ model, method: 'findMany', args: args as Row });
      let rows = store.rows.filter((r) => matchWhere(r, args.where));
      rows = applyOrderBy(rows, args.orderBy);
      if (typeof args.skip === 'number') rows = rows.slice(args.skip);
      if (typeof args.take === 'number') rows = rows.slice(0, args.take);
      return rows.map((r) => project(r, args.select));
    },

    async findFirst(args: {
      where?: Row;
      select?: Row;
      orderBy?: unknown;
    } = {}) {
      calls.push({ model, method: 'findFirst', args: args as Row });
      const rows = applyOrderBy(
        store.rows.filter((r) => matchWhere(r, args.where)),
        args.orderBy,
      );
      const row = rows[0];
      return row ? project(row, args.select) : null;
    },

    async findUnique(args: { where: Row; select?: Row }) {
      calls.push({ model, method: 'findUnique', args: args as Row });
      const row = findByWhere(args.where);
      return row ? project(row, args.select) : null;
    },

    async findUniqueOrThrow(args: { where: Row; select?: Row }) {
      calls.push({ model, method: 'findUniqueOrThrow', args: args as Row });
      const row = findByWhere(args.where);
      if (!row) {
        const err = new Error(
          `No ${model} found for where ${JSON.stringify(args.where)}`,
        );
        (err as any).code = 'P2025';
        throw err;
      }
      return project(row, args.select);
    },

    async create(args: { data: Row; select?: Row }) {
      calls.push({ model, method: 'create', args: args as Row });
      const row = { ...args.data };
      store.rows.push(row);
      return project(row, args.select);
    },

    async createMany(args: { data: Row | Row[] }) {
      calls.push({ model, method: 'createMany', args: args as Row });
      const list = Array.isArray(args.data) ? args.data : [args.data];
      store.rows.push(...list.map((d) => ({ ...d })));
      return { count: list.length };
    },

    async update(args: { where: Row; data: Row; select?: Row }) {
      calls.push({ model, method: 'update', args: args as Row });
      const idx = store.rows.findIndex((r) => matchWhere(r, args.where));
      if (idx < 0) {
        const err = new Error(`No ${model} to update`);
        (err as any).code = 'P2025';
        throw err;
      }
      store.rows[idx] = { ...store.rows[idx], ...args.data };
      return project(store.rows[idx], args.select);
    },

    async updateMany(args: { where: Row; data: Row }) {
      calls.push({ model, method: 'updateMany', args: args as Row });
      let count = 0;
      store.rows = store.rows.map((r) => {
        if (!matchWhere(r, args.where)) return r;
        count += 1;
        return { ...r, ...args.data };
      });
      return { count };
    },

    async upsert(args: {
      where: Row;
      create: Row;
      update: Row;
      select?: Row;
    }) {
      calls.push({ model, method: 'upsert', args: args as Row });
      const idx = store.rows.findIndex((r) => matchWhere(r, args.where));
      if (idx >= 0) {
        store.rows[idx] = { ...store.rows[idx], ...args.update };
        return project(store.rows[idx], args.select);
      }
      const row = { ...args.create };
      // ensure PK from where if missing
      for (const f of pkFields) {
        if (row[f] === undefined && args.where[f] !== undefined) {
          row[f] = args.where[f];
        }
      }
      store.rows.push(row);
      return project(row, args.select);
    },

    async delete(args: { where: Row; select?: Row }) {
      calls.push({ model, method: 'delete', args: args as Row });
      const idx = store.rows.findIndex((r) => matchWhere(r, args.where));
      if (idx < 0) {
        const err = new Error(`No ${model} to delete`);
        (err as any).code = 'P2025';
        throw err;
      }
      const [removed] = store.rows.splice(idx, 1);
      return project(removed, args.select);
    },

    async deleteMany(args: { where: Row }) {
      calls.push({ model, method: 'deleteMany', args: args as Row });
      const before = store.rows.length;
      store.rows = store.rows.filter((r) => !matchWhere(r, args.where));
      return { count: before - store.rows.length };
    },

    async count(args: { where?: Row; take?: number } = {}) {
      calls.push({ model, method: 'count', args: args as Row });
      const rows = store.rows.filter((r) => matchWhere(r, args.where));
      if (typeof args.take === 'number') return Math.min(rows.length, args.take);
      return rows.length;
    },

    async findFirstOrThrow(args: {
      where?: Row;
      select?: Row;
      orderBy?: unknown;
    } = {}) {
      calls.push({ model, method: 'findFirstOrThrow', args: args as Row });
      const rows = applyOrderBy(
        store.rows.filter((r) => matchWhere(r, args.where)),
        args.orderBy,
      );
      const row = rows[0];
      if (!row) {
        const err = new Error(`No ${model} found`);
        (err as any).code = 'P2025';
        throw err;
      }
      return project(row, args.select);
    },

    async aggregate(args: Row = {}) {
      calls.push({ model, method: 'aggregate', args });
      const where = (args as { where?: Row }).where;
      const rows = store.rows.filter((r) => matchWhere(r, where));
      return { _count: { _all: rows.length } };
    },

    async groupBy(args: Row = {}) {
      calls.push({ model, method: 'groupBy', args });
      return [];
    },

    async createManyAndReturn(args: {
      data: Row | Row[];
      select?: Row;
      skipDuplicates?: boolean;
    }) {
      calls.push({ model, method: 'createManyAndReturn', args: args as Row });
      const list = Array.isArray(args.data) ? args.data : [args.data];
      const created = list.map((d) => ({ ...d }));
      store.rows.push(...created);
      return created.map((r) => project(r, args.select));
    },

    async updateManyAndReturn(args: {
      where: Row;
      data: Row;
      select?: Row;
    }) {
      calls.push({ model, method: 'updateManyAndReturn', args: args as Row });
      const updated: Row[] = [];
      store.rows = store.rows.map((r) => {
        if (!matchWhere(r, args.where)) return r;
        const next = { ...r, ...args.data };
        updated.push(next);
        return next;
      });
      return updated.map((r) => project(r, args.select));
    },
  };
}

/**
 * In-memory fake Prisma client for repository unit tests.
 * Supports delegates, `$queryRawUnsafe` recording, and `$transaction`.
 */
export function createFakePrisma(
  options: FakePrismaOptions,
): FakePrismaClient {
  const calls: DelegateCall[] = [];
  const rawCalls: RawCall[] = [];
  const stores: Record<string, FakeModelStore> = {};
  for (const [name, store] of Object.entries(options.models)) {
    stores[name] = {
      rows: store.rows.map((r) => ({ ...r })),
      primaryKey: store.primaryKey,
    };
  }

  const buildClient = (): FakePrismaClient => {
    const client: FakePrismaClient = {
      __calls: calls,
      __rawCalls: rawCalls,
      __resetCalls: () => {
        calls.length = 0;
        rawCalls.length = 0;
      },
      __getRows: (model: string) => stores[model]?.rows ?? [],
      __setRows: (model: string, rows: Row[]) => {
        if (!stores[model]) stores[model] = { rows: [] };
        stores[model].rows = rows.map((r) => ({ ...r }));
      },
      async $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T> {
        rawCalls.push({ sql, values });
        if (options.onRaw) {
          return (await options.onRaw(sql, values)) as T;
        }
        return [] as T;
      },
      async $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number> {
        rawCalls.push({ sql, values });
        return 0;
      },
      async $queryRaw(sql: TemplateStringsArray, ...values: unknown[]) {
        return this.$queryRawUnsafe(String(sql), ...values);
      },
      async $executeRaw(sql: TemplateStringsArray, ...values: unknown[]) {
        return this.$executeRawUnsafe(String(sql), ...values);
      },
      async $transaction<T>(
        fn: (tx: FakePrismaClient) => Promise<T>,
      ): Promise<T> {
        // Same stores (shared visibility) — enough for lock + compose tests.
        return fn(buildClient());
      },
    };

    for (const [name, store] of Object.entries(stores)) {
      (client as any)[name] = createDelegate(name, store, calls);
    }

    return client;
  };

  return buildClient();
}
