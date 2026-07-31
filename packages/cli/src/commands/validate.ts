import {
  assertSelectComposeValid,
  validateSelectCompose,
} from '@prismakit/core';

export type ValidateCommandOptions = {
  cwd?: string;
  assert?: boolean;
};

/**
 * Run select-compose validation from @prismakit/core.
 */
export function runValidate(options: ValidateCommandOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();

  if (options.assert !== false) {
    try {
      assertSelectComposeValid(cwd);
      console.log('Select compose validation passed.');
    } catch (err) {
      console.error((err as Error).message);
      process.exitCode = 1;
    }
    return;
  }

  const issues = validateSelectCompose(cwd);
  if (issues.length === 0) {
    console.log('Select compose validation passed.');
    return;
  }

  for (const issue of issues) {
    console.error(`  - ${issue.file}: ${issue.message}`);
  }
  process.exitCode = 1;
}
