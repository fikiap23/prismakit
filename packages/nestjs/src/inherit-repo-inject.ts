import { ModulesContainer } from '@nestjs/core';

export const PRISMAKIT_REPO = '__prismakitRepo';
export const PRISMAKIT_REPO_META = '__prismakitRepoMeta';

export type PrismakitRepoMeta = {
  model?: string;
  hasCache: boolean;
};

export function markPrismakitRepo(
  ctor: Function,
  meta?: PrismakitRepoMeta,
): void {
  Object.defineProperty(ctor, PRISMAKIT_REPO, {
    value: true,
    enumerable: false,
  });
  if (meta) {
    Object.defineProperty(ctor, PRISMAKIT_REPO_META, {
      value: meta,
      enumerable: false,
    });
  }
}

export function getPrismakitRepoMeta(
  fn: unknown,
): PrismakitRepoMeta | undefined {
  const branded = brandedCtor(fn);
  if (!branded) return undefined;
  return (branded as unknown as Record<string, unknown>)[
    PRISMAKIT_REPO_META
  ] as PrismakitRepoMeta | undefined;
}

export function collectLiveRepoProviders(container: ModulesContainer): {
  cachedModels: Set<string>;
  classNames: Set<string>;
  instancesByModel: Map<string, Set<object>>;
} {
  const cachedModels = new Set<string>();
  const classNames = new Set<string>();
  const instancesByModel = new Map<string, Set<object>>();
  for (const nestModule of container.values()) {
    for (const wrapper of nestModule.providers.values()) {
      const metatype = wrapper.metatype;
      if (typeof metatype !== 'function') continue;
      const meta = getPrismakitRepoMeta(metatype);
      if (!meta) continue;
      if (metatype.name) classNames.add(metatype.name);
      if (meta.hasCache && meta.model) cachedModels.add(meta.model);
      if (meta.model && wrapper.instance && typeof wrapper.instance === 'object') {
        let set = instancesByModel.get(meta.model);
        if (!set) {
          set = new Set();
          instancesByModel.set(meta.model, set);
        }
        set.add(wrapper.instance);
      }
    }
  }
  return { cachedModels, classNames, instancesByModel };
}

export function copyReflectMetadata(source: Function, target: Function): void {
  const keys = Reflect.getMetadataKeys(source);
  for (const key of keys) {
    if (Reflect.hasMetadata(key, target)) continue;
    const value = Reflect.getMetadata(key, source);
    Reflect.defineMetadata(key, value, target);
  }
}

function brandedCtor(fn: unknown): Function | undefined {
  let current: unknown = fn;
  while (typeof current === 'function' && current !== Function.prototype) {
    if (Object.prototype.hasOwnProperty.call(current, PRISMAKIT_REPO)) {
      return current;
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

/**
 * Empty `class Foo extends defineAppRepo({...}) {}` does not inherit Nest
 * `design:paramtypes` / `@Inject` metadata. Copy it from the branded base.
 */
export function inheritRepoInjection(modules: ModulesContainer): void {
  for (const nestModule of modules.values()) {
    for (const wrapper of nestModule.providers.values()) {
      const metatype = wrapper.metatype;
      if (typeof metatype !== 'function') continue;
      const parent = Object.getPrototypeOf(metatype);
      const branded = brandedCtor(parent);
      if (!branded || branded === metatype) continue;
      copyReflectMetadata(branded, metatype);
    }
  }
}
