import type { Rule } from 'eslint';

import { isAllowedPrismaPath } from '../utils';

/**
 * Report `.$transaction(` calls outside infrastructure / repositories.
 * Feature code must use TransactionService.execTx instead.
 */
export const requireTransactionService: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow prisma.$transaction outside infrastructure/repositories; use TransactionService',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not call $transaction directly. Use TransactionService.execTx in feature code.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isAllowedPrismaPath(filename)) {
      return {};
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const { property, computed } = node.callee;
        if (computed || property.type !== 'Identifier') return;
        if (property.name !== '$transaction') return;

        context.report({ node: property, messageId: 'forbidden' });
      },
    };
  },
};
