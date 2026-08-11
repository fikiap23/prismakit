import type { ESLint, Linter, Rule } from 'eslint';

import { noPrismaServiceOutsideRepos } from './rules/no-prisma-service-outside-repos';
import { noDirectPrismaDelegate } from './rules/no-direct-prisma-delegate';
import { requireTransactionService } from './rules/require-transaction-service';
import { requireCachedRepoProvider } from './rules/require-cached-repo-provider';

const rules: Record<string, Rule.RuleModule> = {
  'no-prisma-service-outside-repos': noPrismaServiceOutsideRepos,
  'no-direct-prisma-delegate': noDirectPrismaDelegate,
  'require-transaction-service': requireTransactionService,
  'require-cached-repo-provider': requireCachedRepoProvider,
};

const plugin = {
  meta: {
    name: 'prismakit',
    version: '0.1.0',
  },
  rules,
} as ESLint.Plugin;

/** Flat-config recommended preset — all rules as error. */
export const recommended: Linter.Config = {
  name: 'prismakit/recommended',
  plugins: {
    prismakit: plugin,
  },
  rules: {
    'prismakit/no-prisma-service-outside-repos': 'error',
    'prismakit/no-direct-prisma-delegate': 'error',
    'prismakit/require-transaction-service': 'error',
    'prismakit/require-cached-repo-provider': 'error',
  },
};

plugin.configs = {
  recommended,
};

export default plugin;
export { rules };
export {
  noPrismaServiceOutsideRepos,
  noDirectPrismaDelegate,
  requireTransactionService,
  requireCachedRepoProvider,
};
