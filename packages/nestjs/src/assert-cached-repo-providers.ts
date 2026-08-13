import fs from 'node:fs';
import path from 'node:path';

const REPO_FILE_RE = /repositories[/\\][\w.-]+\.repository\.(ts|js)$/;
const DEFAULT_MODULE_ROOTS = ['src/modules', 'build/compile/src/modules'];

const FACTORIES =
  'defineAppRepo|createInjectableRepository|createRepository|createDefineRepo';

export type CachedRepoDeclaration = {
  className: string;
  model: string;
  file: string;
};

function sliceBalanced(
  source: string,
  openIndex: number,
  open: string,
  close: string,
): string | null {
  if (source[openIndex] !== open) return null;
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
}

function listFilesRecursive(dir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...listFilesRecursive(full, pattern));
    } else if (pattern.test(full)) {
      results.push(full);
    }
  }
  return results;
}

function sliceBalancedBracket(source: string, openIndex: number): string | null {
  return sliceBalanced(source, openIndex, '[', ']');
}

function moduleRegistersProvider(source: string, className: string): boolean {
  const needle = new RegExp(`\\b${className}\\b`);
  const re = /\bproviders\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const open = source.indexOf('[', match.index);
    if (open < 0) continue;
    const body = sliceBalancedBracket(source, open);
    if (body && needle.test(body)) return true;
  }
  return false;
}

function repoClassNamesFromSource(source: string): string[] {
  const names: string[] = [];
  const patterns = [
    new RegExp(
      String.raw`export\s+class\s+(\w+)\s+extends\s+(?:${FACTORIES})\s*\(`,
      'g',
    ),
    new RegExp(
      String.raw`export\s+const\s+(\w+)\s*=\s*(?:${FACTORIES})\s*\(`,
      'g',
    ),
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) names.push(match[1]);
  }
  return names;
}

function scanRoots(projectRoot: string, modulesRoot?: string): string[] {
  const candidates = (modulesRoot ? [modulesRoot] : DEFAULT_MODULE_ROOTS).map(
    (rel) => path.resolve(projectRoot, rel),
  );
  const existing = candidates.filter((dir) => fs.existsSync(dir));
  // Prefer `src/modules` over compiled output — they are the same modules.
  return existing.length > 0 ? [existing[0]] : candidates.slice(0, 1);
}

function cachedReposFromSource(
  source: string,
  file: string,
): CachedRepoDeclaration[] {
  const decls: CachedRepoDeclaration[] = [];
  const patterns = [
    new RegExp(
      String.raw`export\s+class\s+(\w+)\s+extends\s+(?:${FACTORIES})\s*\(`,
      'g',
    ),
    new RegExp(
      String.raw`export\s+const\s+(\w+)\s*=\s*(?:${FACTORIES})\s*\(`,
      'g',
    ),
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
      const paren = match.index + match[0].length - 1;
      const args = sliceBalanced(source, paren, '(', ')');
      if (!args || !/\bcache\s*:/.test(args)) continue;
      const modelMatch = args.match(/\bmodel\s*:\s*['"]([^'"]+)['"]/);
      if (!modelMatch) continue;
      decls.push({ className: match[1], model: modelMatch[1], file });
    }
  }
  return decls;
}

export function findCachedRepoDeclarations(
  projectRoot: string,
  modulesRoot?: string,
): CachedRepoDeclaration[] {
  const seen = new Set<string>();
  const decls: CachedRepoDeclaration[] = [];
  for (const dir of scanRoots(projectRoot, modulesRoot)) {
    for (const file of listFilesRecursive(dir, REPO_FILE_RE)) {
      const key = path.relative(projectRoot, file).replace(/\\/g, '/');
      const dedupe = key.replace(/\.js$/, '.ts').replace(/^build\/compile\//, '');
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      try {
        decls.push(...cachedReposFromSource(fs.readFileSync(file, 'utf8'), key));
      } catch {
        /* skip unreadable */
      }
    }
  }
  return decls;
}

export function assertCachedRepoProviders(options: {
  projectRoot: string;
  modulesRoot?: string;
  cachedModels: ReadonlySet<string>;
  classNames: ReadonlySet<string>;
}): void {
  const missing = findCachedRepoDeclarations(
    options.projectRoot,
    options.modulesRoot,
  ).filter(
    (decl) =>
      !options.cachedModels.has(decl.model) &&
      !options.classNames.has(decl.className),
  );
  if (missing.length === 0) return;

  const lines = missing.map(
    (d) => `  ${d.className}  model "${d.model}"  ${d.file}`,
  );
  throw new Error(
    [
      '[PrismaKit] Cached repository is not a Nest provider — autoRegisterModels would use an uncached stub.',
      '',
      ...lines,
      '',
      'Add each class to the feature module `providers` array (and `exports` if other modules inject it).',
      'Set PrismaKitModule `{ strictCachedRepos: false }` to disable this check.',
    ].join('\n'),
  );
}

export function assertUniqueRepoInstances(
  instancesByModel: Map<string, Set<object>>,
): void {
  const dups = [...instancesByModel.entries()].filter(
    ([, set]) => set.size > 1,
  );
  if (dups.length === 0) return;
  const lines = dups.map(
    ([model, set]) => `  model "${model}"  ${set.size} instances`,
  );
  throw new Error(
    [
      '[PrismaKit] Repository class is in `providers` of more than one Nest module.',
      'Nest constructed multiple instances; cache/compose will last-write-win on the registry.',
      '',
      ...lines,
      '',
      'Keep the class in one feature module `providers` + `exports`, and `imports` that module elsewhere.',
      'Set PrismaKitModule `{ strictCachedRepos: false }` to disable this check.',
    ].join('\n'),
  );
}

const MODULE_FILE_RE = /\.module\.(ts|js)$/;

export type DuplicateRepoProvider = {
  className: string;
  files: string[];
};

export function findDuplicateRepoProviders(
  projectRoot: string,
  modulesRoot?: string,
): DuplicateRepoProvider[] {
  const repoNames = new Set<string>();
  const moduleFiles: string[] = [];
  for (const dir of scanRoots(projectRoot, modulesRoot)) {
    for (const file of listFilesRecursive(dir, REPO_FILE_RE)) {
      try {
        for (const name of repoClassNamesFromSource(
          fs.readFileSync(file, 'utf8'),
        )) {
          repoNames.add(name);
        }
      } catch {
        /* skip */
      }
    }
    for (const file of listFilesRecursive(dir, MODULE_FILE_RE)) {
      moduleFiles.push(file);
    }
  }
  if (repoNames.size === 0 || moduleFiles.length === 0) return [];

  const dups: DuplicateRepoProvider[] = [];
  for (const className of repoNames) {
    const files = moduleFiles.filter((file) => {
      try {
        return moduleRegistersProvider(fs.readFileSync(file, 'utf8'), className);
      } catch {
        return false;
      }
    });
    if (files.length < 2) continue;
    dups.push({
      className,
      files: files.map((f) =>
        path.relative(projectRoot, f).replace(/\\/g, '/'),
      ),
    });
  }
  return dups;
}

export function assertDuplicateRepoProviders(options: {
  projectRoot: string;
  modulesRoot?: string;
}): void {
  const dups = findDuplicateRepoProviders(
    options.projectRoot,
    options.modulesRoot,
  );
  if (dups.length === 0) return;
  const lines = dups.map((d) => `  ${d.className}  ${d.files.join(', ')}`);
  throw new Error(
    [
      '[PrismaKit] Repository class is in `providers` of more than one Nest module.',
      'Nest will construct multiple instances; cache/compose last-write-wins on the registry.',
      '',
      ...lines,
      '',
      'Keep the class in one feature module `providers` + `exports`, and `imports` that module elsewhere.',
      'Set PrismaKitModule `{ strictCachedRepos: false }` to disable this check.',
    ].join('\n'),
  );
}
