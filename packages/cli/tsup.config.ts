import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['cjs', 'esm'],
  dts: { entry: { index: 'src/index.ts' } },
  sourcemap: true,
  clean: true,
  async onSuccess() {
    const { readFileSync, writeFileSync, chmodSync, cpSync, existsSync, mkdirSync } =
      await import('node:fs');
    const { join } = await import('node:path');
    const binPath = join('dist', 'bin.js');
    const content = readFileSync(binPath, 'utf-8');
    if (!content.startsWith('#!')) {
      writeFileSync(binPath, `#!/usr/bin/env node\n${content}`);
    }
    chmodSync(binPath, 0o755);

    // Bundle agent skills + cursor rule into the published package so
    // `npx prismakit skills` works without cloning the git repo.
    const pkgRoot = process.cwd();
    const repoRoot = join(pkgRoot, '..', '..');
    const skillsSrc = join(repoRoot, 'skills');
    const skillsDest = join(pkgRoot, 'skills');
    if (existsSync(skillsSrc)) {
      mkdirSync(skillsDest, { recursive: true });
      cpSync(skillsSrc, skillsDest, { recursive: true });
    }
    const ruleSrc = join(repoRoot, 'templates', 'cursor-rules', 'data-access.mdc');
    const ruleDestDir = join(pkgRoot, 'rules');
    if (existsSync(ruleSrc)) {
      mkdirSync(ruleDestDir, { recursive: true });
      cpSync(ruleSrc, join(ruleDestDir, 'data-access.mdc'));
    }
  },
});
