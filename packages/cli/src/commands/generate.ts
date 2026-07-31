import * as fs from 'node:fs';
import * as path from 'node:path';

import { resolveNames } from '../naming';
import { renderModuleFiles } from '../templates';

export type GenerateCommandOptions = {
  name: string;
  cache?: boolean;
  route?: string;
  cwd?: string;
  dryRun?: boolean;
  /** Emit full Nest module (controller/service/types). Default: repo-only. */
  full?: boolean;
  /** Prisma client import path (default `@prisma/client`). */
  prismaImport?: string;
};

export function runGenerate(options: GenerateCommandOptions): void {
  const cwd = options.cwd ?? process.cwd();
  const names = resolveNames(options.name, options.route);
  const full = !!options.full;
  const files = renderModuleFiles({
    names,
    cacheEnabled: !!options.cache,
    full,
    prismaImport: options.prismaImport,
  });

  for (const file of files) {
    const fullPath = path.join(cwd, file.relativePath);
    if (options.dryRun) {
      console.log(`[dry-run] would write ${file.relativePath}`);
      continue;
    }
    if (fs.existsSync(fullPath)) {
      console.warn(`skip (exists): ${file.relativePath}`);
      continue;
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const content = file.content.endsWith('\n')
      ? file.content
      : `${file.content}\n`;
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`created ${file.relativePath}`);
  }

  if (full) {
    console.log(
      `\nScaffolded module "${names.kebab}". Register ${names.pascal}Module in app.module.ts.`,
    );
  } else {
    console.log(
      `\nScaffolded repository "${names.pascal}Repository". Register it in your feature module providers.`,
    );
  }
}
