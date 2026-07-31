import { describe, it, expect } from 'vitest';
import { resolveNames } from '../naming';
import { renderModuleFiles } from '../templates';

describe('cli naming', () => {
  it('resolves kebab to pascal/camel', () => {
    const n = resolveNames('product-category');
    expect(n.kebab).toBe('product-category');
    expect(n.pascal).toBe('ProductCategory');
    expect(n.camel).toBe('productCategory');
  });
});

describe('cli generate templates', () => {
  it('defaults to repo-only', () => {
    const files = renderModuleFiles({
      names: resolveNames('product'),
      cacheEnabled: true,
    });
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toContain('repositories/product.repository.ts');
    expect(files[0].content).toContain("model: 'product'");
    expect(files[0].content).toContain('cache: {');
    expect(files[0].content).not.toContain('getDelegate');
    expect(files[0].content).toContain("from '@prisma/client'");
  });

  it('emits full Nest module when full: true', () => {
    const files = renderModuleFiles({
      names: resolveNames('product'),
      cacheEnabled: false,
      full: true,
    });
    const paths = files.map((f) => f.relativePath);
    expect(paths.some((p) => p.endsWith('product.module.ts'))).toBe(true);
    expect(paths.some((p) => p.includes('controllers/'))).toBe(true);
    expect(paths.some((p) => p.includes('services/'))).toBe(true);
    const controller = files.find((f) => f.relativePath.includes('controller'));
    expect(controller?.content).not.toContain('JwtGuard');
    expect(controller?.content).not.toContain('@nestjs/swagger');
  });
});
