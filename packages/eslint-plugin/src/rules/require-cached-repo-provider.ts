import fs from 'node:fs';
import path from 'node:path';
import type { Rule } from 'eslint';
import type { ObjectExpression } from 'estree';

const REPO_FACTORIES = new Set([
  'defineAppRepo',
  'defineRepo',
  'defineRepository',
  'defineInjectableRepository',
  'createInjectableRepository',
  'createPrismaRepository',
  'createRepository',
]);

function calleeName(node: { type: string; callee?: unknown }): string | undefined {
  if (node.type !== 'CallExpression') return undefined;
  const callee = (node as { callee: { type: string; name?: string } }).callee;
  if (callee.type === 'Identifier') return callee.name;
  return undefined;
}

function objectHasCache(arg: unknown): boolean {
  if (!arg || typeof arg !== 'object') return false;
  const obj = arg as ObjectExpression;
  if (obj.type !== 'ObjectExpression') return false;
  return obj.properties.some((prop) => {
    if (prop.type !== 'Property' || prop.computed) return false;
    return prop.key.type === 'Identifier' && prop.key.name === 'cache';
  });
}

function callConfiguresCache(node: {
  type: string;
  arguments?: unknown[];
}): boolean {
  if (node.type !== 'CallExpression') return false;
  const args = node.arguments ?? [];
  return objectHasCache(args[0]);
}

function sliceBalancedBracket(source: string, openIndex: number): string | null {
  if (source[openIndex] !== '[') return null;
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
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

function repoDeclsFromSource(
  source: string,
): Array<{ name: string; hasCache: boolean }> {
  const decls: Array<{ name: string; hasCache: boolean }> = [];
  const factories = [...REPO_FACTORIES].join('|');
  const patterns = [
    new RegExp(
      String.raw`export\s+class\s+(\w+)\s+extends\s+(?:${factories})\s*\(`,
      'g',
    ),
    new RegExp(
      String.raw`export\s+const\s+(\w+)\s*=\s*(?:${factories})\s*\(`,
      'g',
    ),
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
      const paren = match.index + match[0].length - 1;
      const args = sliceBalanced(source, paren, '(', ')');
      decls.push({
        name: match[1],
        hasCache: !!args && /\bcache\s*:/.test(args),
      });
    }
  }
  return decls;
}

function cachedRepoNamesFromSource(source: string): string[] {
  return repoDeclsFromSource(source)
    .filter((d) => d.hasCache)
    .map((d) => d.name);
}

function cachedReposInDir(dir: string): string[] {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const name of entries) {
    if (!name.endsWith('.ts') && !name.endsWith('.js')) continue;
    if (/\.(spec|test)\./.test(name)) continue;
    try {
      names.push(
        ...cachedRepoNamesFromSource(
          fs.readFileSync(path.join(dir, name), 'utf8'),
        ),
      );
    } catch {
      /* skip unreadable files */
    }
  }
  return names;
}

function isRegisteredInAnyModule(className: string, cwd: string): boolean {
  return collectModuleFiles(cwd).some((file) => {
    try {
      return moduleRegistersProvider(fs.readFileSync(file, 'utf8'), className);
    } catch {
      return false;
    }
  });
}

function providerNamesInSource(source: string): string[] {
  const names: string[] = [];
  const re = /\bproviders\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const open = source.indexOf('[', match.index);
    if (open < 0) continue;
    const body = sliceBalancedBracket(source, open);
    if (!body) continue;
    const idRe = /\b([A-Z][A-Za-z0-9]*)\b/g;
    let id: RegExpExecArray | null;
    while ((id = idRe.exec(body))) names.push(id[1]);
  }
  return names;
}

const repoNameCache = new Map<string, Set<string>>();

function collectRepoClassNames(cwd: string): Set<string> {
  const root = path.resolve(cwd);
  const cached = repoNameCache.get(root);
  if (cached) return cached;
  const names = new Set<string>();
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;
      if (/\.(spec|test)\./.test(entry.name)) continue;
      if (!entry.name.includes('.repository.')) continue;
      try {
        for (const decl of repoDeclsFromSource(fs.readFileSync(full, 'utf8'))) {
          names.add(decl.name);
        }
      } catch {
        /* skip */
      }
    }
  };
  walk(root);
  repoNameCache.set(root, names);
  return names;
}

function providersKeywordLoc(
  source: string,
): { line: number; column: number } | null {
  const idx = source.search(/\bproviders\s*:/);
  if (idx < 0) return null;
  const before = source.slice(0, idx);
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n') - 1;
  return { line, column };
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.turbo',
]);

const moduleFileCache = new Map<string, string[]>();

function collectModuleFiles(cwd: string): string[] {
  const root = path.resolve(cwd);
  const cached = moduleFileCache.get(root);
  if (cached) return cached;
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (entry.name.endsWith('.module.ts') || entry.name.endsWith('.module.js')) {
        found.push(full);
      }
    }
  };
  walk(root);
  moduleFileCache.set(root, found);
  return found;
}

/**
 * Cached `defineAppRepo({ cache })` classes must appear in some Nest
 * `providers: [...]`. Otherwise Nest never constructs them and
 * `autoRegisterModels` installs an uncached stub — cache config is a no-op.
 */
export const requireCachedRepoProvider: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require cached repository classes to be listed in a Nest module providers array',
    },
    schema: [],
    messages: {
      missing:
        '{{name}} has cache config but is not in any module `providers: [...]`. Nest will not construct it; autoRegisterModels will use an uncached stub.',
      missingInModule:
        'Add {{name}} to this module\'s `providers` (or another module that Nest loads). It has `cache` config; without a provider Nest uses an uncached autoRegister stub.',
      duplicate:
        '{{name}} is in `providers` of more than one module ({{files}}). Nest constructs a second instance — export from one module and `imports` it in the others.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const normalized = filename.replace(/\\/g, '/');
    if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(normalized)) {
      return {};
    }
    if (/\/node_modules\//.test(normalized)) {
      return {};
    }

    const cwd = context.cwd ?? process.cwd();

    const checkClass = (name: string, node: { type: string }) => {
      if (!isRegisteredInAnyModule(name, cwd)) {
        context.report({ node, messageId: 'missing', data: { name } });
      }
    };

    return {
      Program() {
        if (!/\.module\.[cm]?[jt]sx?$/.test(normalized)) return;
        const repoDir = path.join(path.dirname(filename), 'repositories');
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const source = sourceCode.getText();
        const loc = providersKeywordLoc(source) ?? {
          line: 1,
          column: 0,
        };
        const missing = cachedReposInDir(repoDir).filter(
          (name) => !isRegisteredInAnyModule(name, cwd),
        );
        for (const name of missing) {
          context.report({
            loc,
            messageId: 'missingInModule',
            data: { name },
          });
        }
        const listed = providerNamesInSource(source);
        const repos = collectRepoClassNames(cwd);
        for (const name of listed) {
          if (!repos.has(name)) continue;
          const files = collectModuleFiles(cwd).filter((file) => {
            try {
              return moduleRegistersProvider(
                fs.readFileSync(file, 'utf8'),
                name,
              );
            } catch {
              return false;
            }
          });
          if (files.length < 2) continue;
          context.report({
            loc,
            messageId: 'duplicate',
            data: {
              name,
              files: files
                .map((f) => path.relative(cwd, f).replace(/\\/g, '/'))
                .join(', '),
            },
          });
        }
      },
      ClassDeclaration(node) {
        if (!node.id || !node.superClass) return;
        const superClass = node.superClass as {
          type: string;
          arguments?: unknown[];
          callee?: unknown;
        };
        if (superClass.type !== 'CallExpression') return;
        const factory = calleeName(superClass);
        if (!factory || !REPO_FACTORIES.has(factory)) return;
        if (!callConfiguresCache(superClass)) return;
        checkClass(node.id.name, node.id);
      },
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier') return;
        const init = node.init as
          | { type: string; arguments?: unknown[]; callee?: unknown }
          | null;
        if (!init || init.type !== 'CallExpression') return;
        const factory = calleeName(init);
        if (!factory || !REPO_FACTORIES.has(factory)) return;
        if (!callConfiguresCache(init)) return;
        checkClass(node.id.name, node.id);
      },
    };
  },
};
