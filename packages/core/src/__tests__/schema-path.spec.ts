import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPrismaMeta,
  loadPrismaMetaFromSchema,
} from '../schema/prisma-meta';
import { parseDatasourceProvider } from '../schema/parse-prisma-schema';

afterEach(() => {
  clearPrismaMeta();
});

describe('schema path helpers', () => {
  it('parseDatasourceProvider reads provider from a temp schema file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-schema-path-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Widget {
  id String @id
}
`,
    );

    try {
      expect(parseDatasourceProvider(schemaPath)).toBe('postgresql');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadPrismaMetaFromSchema sets provider and model meta from temp schema', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-schema-load-'));
    const schemaPath = path.join(dir, 'schema.prisma');
    fs.writeFileSync(
      schemaPath,
      `
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Widget {
  id String @id
  name String
}
`,
    );

    try {
      const meta = loadPrismaMetaFromSchema(schemaPath);
      expect(meta.widget).toBeDefined();
      expect(meta.widget?.scalarFields.id).toBe('id');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
