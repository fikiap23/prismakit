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
    const { readFileSync, writeFileSync, chmodSync } = await import('node:fs');
    const { join } = await import('node:path');
    const binPath = join('dist', 'bin.js');
    const content = readFileSync(binPath, 'utf-8');
    if (!content.startsWith('#!')) {
      writeFileSync(binPath, `#!/usr/bin/env node\n${content}`);
    }
    chmodSync(binPath, 0o755);
  },
});
