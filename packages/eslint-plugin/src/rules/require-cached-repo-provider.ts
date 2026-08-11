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

function collectModuleFiles(fromFile: string, cwd: string): string[] {
  const found: string[] = [];
  let dir = path.dirname(fromFile);
  const root = path.resolve(cwd);
  for (;;) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      break;
    }
    for (const name of entries) {
      if (name.endsWith('.module.ts') || name.endsWith('.module.js')) {
        found.push(path.join(dir, name));
      }
    }
    if (path.resolve(dir) === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
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
      const modules = collectModuleFiles(filename, cwd);
      const registered = modules.some((file) => {
        try {
          return moduleRegistersProvider(fs.readFileSync(file, 'utf8'), name);
        } catch {
          return false;
        }
      });
      if (!registered) {
        context.report({ node, messageId: 'missing', data: { name } });
      }
    };

    return {
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
