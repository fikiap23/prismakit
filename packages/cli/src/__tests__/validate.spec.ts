import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runValidate } from '../commands/validate';

describe('runValidate', () => {
  it('is exported and can be imported', () => {
    expect(typeof runValidate).toBe('function');
  });

  it('passes on an empty project when assert is false', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-validate-'));
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      runValidate({ cwd: dir, assert: false });
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
