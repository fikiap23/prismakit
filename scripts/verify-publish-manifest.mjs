#!/usr/bin/env node
/**
 * Guard against publish leaks and missing LICENSE/README.
 *
 * - `workspace:*` in source package.json is expected in a pnpm monorepo; pnpm
 *   rewrites it on publish. Set VERIFY_PUBLISH_STRICT=1 to also fail on
 *   workspace:* (use after a local pack that already rewrote deps).
 * - Always fails if LICENSE / README.md are missing from the packed tarball.
 * - Always fails if peerDependencies on @prismakit/* use a too-loose range
 *   (must be ">=X.Y.Z <N" major-capped).
 */
import { execSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');
const strict = process.env.VERIFY_PUBLISH_STRICT === '1';

const publishable = readdirSync(packagesDir).filter((name) => {
  const pkgPath = join(packagesDir, name, 'package.json');
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return pkg.private !== true && pkg.name?.startsWith('@prismakit/');
});

let failed = false;

for (const name of publishable) {
  const dir = join(packagesDir, name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  console.log(`\n▸ verifying ${pkg.name}@${pkg.version}`);

  for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
    if (typeof range === 'string' && range.includes('workspace:')) {
      if (strict) {
        console.error(
          `  ✗ ${pkg.name} still has workspace dependency ${dep}@${range}`,
        );
        failed = true;
      } else {
        console.log(
          `  · workspace dep ${dep}@${range} (ok in monorepo; pnpm rewrites on publish)`,
        );
      }
    }
  }

  for (const [peer, range] of Object.entries(pkg.peerDependencies ?? {})) {
    if (
      peer.startsWith('@prismakit/') &&
      typeof range === 'string' &&
      !/^>=\d+\.\d+\.\d+ <\d+$/.test(range.trim())
    ) {
      console.error(
        `  ✗ peer ${peer}@${range} should be major-capped (e.g. ">=3.1.0 <4")`,
      );
      failed = true;
    }
  }

  for (const required of ['LICENSE', 'README.md']) {
    if (!existsSync(join(dir, required))) {
      console.error(`  ✗ missing ${required}`);
      failed = true;
    }
  }

  try {
    const out = execSync('npm pack --dry-run --json', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out.trim());
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const files = (entry?.files ?? []).map((f) => f.path ?? f);
    for (const required of ['LICENSE', 'README.md', 'package.json']) {
      if (!files.some((f) => f === required || f.endsWith(`/${required}`))) {
        console.error(`  ✗ packed tarball missing ${required}`);
        failed = true;
      }
    }
    console.log(`  ✓ pack dry-run ok (${files.length} files)`);
  } catch (err) {
    console.error(
      `  ✗ npm pack --dry-run failed: ${err.stderr || err.message}`,
    );
    failed = true;
  }
}

if (failed) {
  console.error('\nverify-publish-manifest: FAILED');
  process.exit(1);
}
console.log('\nverify-publish-manifest: OK');
