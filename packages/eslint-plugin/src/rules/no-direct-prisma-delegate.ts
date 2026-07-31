import type { Rule } from 'eslint';
import type { MemberExpression } from 'estree';

import { isRepositoryPath, PRISMA_DELEGATE_METHODS } from '../utils';

/**
 * Report `prisma.xxx.findUnique` / `this.prisma.user.create` outside repositories.
 */
export const noDirectPrismaDelegate: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct prisma.<model>.<delegate> calls outside repositories',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not call prisma.{{model}}.{{method}} outside repositories/. Use a *Repository method instead.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isRepositoryPath(filename)) {
      return {};
    }

    const normalized = filename.replace(/\\/g, '/');
    if (
      /\/infrastructure\/prisma\//.test(normalized) ||
      /packages\/(core|nestjs|redis)\//.test(normalized)
    ) {
      return {};
    }

    function isPrismaRoot(node: MemberExpression['object']): boolean {
      if (node.type === 'Identifier') {
        return node.name === 'prisma' || node.name === 'prismaClient';
      }
      if (node.type === 'MemberExpression' && !node.computed) {
        const prop = node.property;
        if (prop.type === 'Identifier' && prop.name === 'prisma') {
          // this.prisma / client.prisma
          return true;
        }
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const methodExpr = node.callee;
        if (methodExpr.computed || methodExpr.property.type !== 'Identifier') {
          return;
        }
        const methodName = methodExpr.property.name;
        if (!PRISMA_DELEGATE_METHODS.has(methodName)) return;

        // Expect prisma.model.method(...) → MemberExpression(MemberExpression(prisma, model), method)
        const modelExpr = methodExpr.object;
        if (modelExpr.type !== 'MemberExpression' || modelExpr.computed) {
          return;
        }
        if (modelExpr.property.type !== 'Identifier') return;
        if (!isPrismaRoot(modelExpr.object)) return;

        context.report({
          node,
          messageId: 'forbidden',
          data: {
            model: modelExpr.property.name,
            method: methodName,
          },
        });
      },
    };
  },
};
