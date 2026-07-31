import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('@prismakit/eslint-plugin', () => {
  it('exports recommended config and rules', () => {
    expect(plugin.meta?.name).toBe('prismakit');
    expect(plugin.rules?.['no-prisma-service-outside-repos']).toBeDefined();
    expect(plugin.rules?.['no-direct-prisma-delegate']).toBeDefined();
    expect(plugin.rules?.['require-transaction-service']).toBeDefined();
    expect(plugin.configs?.recommended).toBeDefined();
  });
});
