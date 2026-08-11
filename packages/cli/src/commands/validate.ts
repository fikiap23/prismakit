import {
  assertSelectComposeValid,
  validateSelectCompose,
} from '@prismakit/core';

export type ValidateCommandOptions = {
  cwd?: string;
  assert?: boolean;
  schemaPath?: string;
  autoRegisterModels?: boolean;
};

/**
 * Run select-compose validation from @prismakit/core.
 */
export function runValidate(options: ValidateCommandOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();
  const validateOptions = {
    schemaPath: options.schemaPath,
    autoRegisterModels: options.autoRegisterModels,
  };

  if (options.assert !== false) {
    try {
      assertSelectComposeValid(cwd, validateOptions);
      console.log('Select compose validation passed.');
    } catch (err) {
      console.error((err as Error).message);
      process.exitCode = 1;
    }
    return;
  }

  const issues = validateSelectCompose(cwd, validateOptions);
  if (issues.length === 0) {
    console.log('Select compose validation passed.');
    return;
  }

  for (const issue of issues) {
    console.error(`  - ${issue.file}: ${issue.message}`);
  }
  process.exitCode = 1;
}
