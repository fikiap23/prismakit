import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertLockPrerequisites,
  clearPrismaMeta,
  getDatasourceProvider,
  loadPrismaMetaFromSchema,
  parseDatasourceProvider,
  setDatasourceProvider,
  UnsupportedProviderError,
} from '../../index';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('postgres locks (integration)', () => {
  afterEach(() => {
    clearPrismaMeta();
  });

  it('loads postgresql provider from a temp schema file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-lock-schema-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id String @id
}
`,
    );

    try {
      loadPrismaMetaFromSchema(schemaPath);
      expect(parseDatasourceProvider(schemaPath)).toBe('postgresql');
      expect(getDatasourceProvider()).toBe('postgresql');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws UnsupportedProviderError when provider is not postgres', () => {
    setDatasourceProvider('sqlite');
    const fakeTx = { $queryRawUnsafe: async () => [] };

    expect(() =>
      assertLockPrerequisites(fakeTx, {
        tableName: 'users',
        columnMap: { id: 'id' },
      }),
    ).toThrow(UnsupportedProviderError);
  });

  // Real FOR UPDATE tests against Postgres can be added here when a seeded schema is available.
});
