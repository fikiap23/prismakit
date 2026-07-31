let registeredCacheModels = new Set<string>();

/**
 * Register model keys that are allowed to use repository cache config.
 * Prefer `PrismaKitModule.forRoot({ cacheModels: [...] })` in Nest apps.
 * Empty set = validation skipped (fail-open for early adoption).
 */
export function setRegisteredCacheModels(keys: readonly string[]): void {
  registeredCacheModels = new Set(keys);
}

export function getRegisteredCacheModels(): ReadonlySet<string> {
  return registeredCacheModels;
}

export function validateCacheConfig(model: string): void {
  if (registeredCacheModels.size === 0) return;
  if (!registeredCacheModels.has(model)) {
    throw new Error(
      `Cache config for model "${model}" is not registered. ` +
        `Pass cacheModels: ['${model}', ...] to PrismaKitModule.forRoot, ` +
        `or call setRegisteredCacheModels([...]), or remove cache from the repository.`,
    );
  }
}
