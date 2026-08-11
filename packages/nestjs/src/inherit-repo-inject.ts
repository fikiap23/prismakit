import { ModulesContainer } from '@nestjs/core';

export const PRISMAKIT_REPO = '__prismakitRepo';

export function markPrismakitRepo(ctor: Function): void {
  Object.defineProperty(ctor, PRISMAKIT_REPO, {
    value: true,
    enumerable: false,
  });
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
