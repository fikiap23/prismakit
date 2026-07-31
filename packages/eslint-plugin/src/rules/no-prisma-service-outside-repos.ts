import type { Rule } from 'eslint';

import { isRepositoryPath } from '../utils';

const FORBIDDEN_NAMES = new Set(['PrismaService', 'PrismaClient']);

/**
 * Report Identifier / import of PrismaService or PrismaClient outside
 * paths matching repositories directories.
 */
export const noPrismaServiceOutsideRepos: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow PrismaService / PrismaClient outside repository files',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not use {{name}} outside repositories/. Inject *Repository and TransactionService instead.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isRepositoryPath(filename)) {
      return {};
    }

    // Allow kit infrastructure paths
    const normalized = filename.replace(/\\/g, '/');
    if (
      /\/infrastructure\/prisma\//.test(normalized) ||
      /packages\/(core|nestjs|redis)\//.test(normalized)
    ) {
      return {};
    }

    return {
      ImportSpecifier(node) {
        if (
          node.imported.type === 'Identifier' &&
          FORBIDDEN_NAMES.has(node.imported.name)
        ) {
          context.report({
            node: node.imported,
            messageId: 'forbidden',
            data: { name: node.imported.name },
          });
        }
      },
      ImportDefaultSpecifier(node) {
        if (FORBIDDEN_NAMES.has(node.local.name)) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { name: node.local.name },
          });
        }
      },
      Identifier(node) {
        if (!FORBIDDEN_NAMES.has(node.name)) return;
        // Skip the import local bindings already reported above
        const parent = node.parent;
        if (
          parent?.type === 'ImportSpecifier' ||
          parent?.type === 'ImportDefaultSpecifier' ||
          parent?.type === 'ImportNamespaceSpecifier'
        ) {
          return;
        }
        // Skip property keys: { PrismaService: ... }
        if (
          parent?.type === 'Property' &&
          parent.key === node &&
          !parent.computed
        ) {
          return;
        }
        // Skip member expression property: obj.PrismaService
        if (
          parent?.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed
        ) {
          return;
        }
        context.report({
          node,
          messageId: 'forbidden',
          data: { name: node.name },
        });
      },
    };
  },
};
