import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest';
import {
  stableHash,
  singleflight,
  clearSingleflight,
  splitSelect,
  setComposeOptions,
  getComposeOptions,
  setTelemetry,
  emitTelemetry,
  type TelemetryEvent,
} from '../index';

describe('stableHash (FNV)', () => {
  it('is deterministic', () => {
    const a = { b: 1, a: 2 };
    const b = { a: 2, b: 1 };
    expect(stableHash(a)).toBe(stableHash(b));
  });

  it('caches by object identity', () => {
    const obj = { id: true, name: true };
    const h1 = stableHash(obj);
    const h2 = stableHash(obj);
    expect(h1).toBe(h2);
  });
});

describe('singleflight', () => {
  beforeEach(() => clearSingleflight());

  it('dedupes concurrent callers', async () => {
    let runs = 0;
    const fn = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 42;
    };
    const [a, b, c] = await Promise.all([
      singleflight('k', fn),
      singleflight('k', fn),
      singleflight('k', fn),
    ]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
    expect(runs).toBe(1);
  });
});

describe('splitSelect', () => {
  it('splits relations and injects FK', () => {
    const { dbSelect, relations } = splitSelect(
      {
        id: true,
        name: true,
        author: { select: { id: true, email: true } },
      },
      { id: 'id', name: 'name', authorId: 'authorId' },
    );
    expect(dbSelect).toEqual({ id: true, name: true, authorId: true });
    expect(relations).toHaveProperty('author');
  });
});

describe('compose options', () => {
  it('merges defaults', () => {
    setComposeOptions({ maxDepth: 3 });
    expect(getComposeOptions().maxDepth).toBe(3);
    expect(getComposeOptions().parallel).toBe(true);
    setComposeOptions(undefined);
  });
});

describe('telemetry', () => {
  it('emits when enabled', () => {
    const events: TelemetryEvent[] = [];
    setTelemetry({
      enabled: true,
      onEvent: (e) => events.push(e),
    });
    emitTelemetry({ type: 'cache.hit', model: 'user', method: 'getById' });
    expect(events).toHaveLength(1);
    setTelemetry({ enabled: false });
  });
});
