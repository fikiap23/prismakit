/**
 * Synthetic micro-benchmarks — no Postgres / Prisma client required.
 *
 * Run: pnpm --filter @prismakit/benchmark start
 */
import { createHash } from 'node:crypto';
import { Bench } from 'tinybench';
import {
  clearSingleflight,
  singleflight,
  splitSelect,
  stableHash,
} from '@prismakit/core';

const nestedSelect = {
  id: true,
  email: true,
  name: true,
  role: {
    select: {
      id: true,
      code: true,
      permissions: { select: { id: true, code: true } },
    },
  },
  posts: {
    select: {
      id: true,
      title: true,
      tags: { select: { id: true, name: true } },
    },
  },
};

const scalarFields = {
  id: 'id',
  email: 'email',
  name: 'name',
  roleId: 'roleId',
};

function sha256Json(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

async function benchStableHash() {
  const bench = new Bench({ time: 500 });
  const payload = { ...nestedSelect, stamp: Date.now() };

  bench
    .add('stableHash (FNV)', () => {
      stableHash(payload);
    })
    .add('crypto sha256(JSON)', () => {
      sha256Json(payload);
    });

  await bench.run();
  console.log('\n=== stableHash vs crypto sha256 ===');
  console.table(bench.table());
}

async function benchSplitSelect() {
  const bench = new Bench({ time: 500 });
  // Fresh object each iteration so WeakMap identity cache does not dominate.
  bench.add('splitSelect (nested)', () => {
    splitSelect({ ...nestedSelect }, scalarFields);
  });
  bench.add('splitSelect (same identity)', () => {
    splitSelect(nestedSelect, scalarFields);
  });

  await bench.run();
  console.log('\n=== splitSelect ===');
  console.table(bench.table());
}

async function benchSingleflight() {
  clearSingleflight();
  const concurrency = 64;
  const iterations = 200;
  const workMs = 2;

  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    clearSingleflight();
    const key = `k-${i}`;
    let runs = 0;
    const fn = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, workMs));
      return runs;
    };
    const results = await Promise.all(
      Array.from({ length: concurrency }, () => singleflight(key, fn)),
    );
    if (results.some((r) => r !== 1)) {
      throw new Error('singleflight failed to dedupe');
    }
  }
  const elapsed = performance.now() - t0;

  // Naive: no sharing — each waiter runs workMs
  const naiveEstimateMs = iterations * concurrency * workMs;

  console.log('\n=== singleflight concurrency ===');
  console.log(
    JSON.stringify(
      {
        concurrency,
        iterations,
        workMs,
        elapsedMs: Math.round(elapsed),
        naiveEstimateMs,
        speedupApprox: Number((naiveEstimateMs / elapsed).toFixed(1)),
      },
      null,
      2,
    ),
  );
}

async function main() {
  console.log('PrismaKit synthetic benchmarks (no DB)\n');
  await benchStableHash();
  await benchSplitSelect();
  await benchSingleflight();
  console.log('\nDone. Full end-to-end DB benches require Postgres + a real PrismaClient.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
