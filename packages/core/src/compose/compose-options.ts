/**
 * Global / per-call options for AutoComposer.
 */

export type ComposeOptions = {
  /** Max relation nesting depth (default: 10). */
  maxDepth?: number;
  /**
   * When true (default), same-level relations run in parallel via Promise.all.
   * Set false for sequential debugging.
   */
  parallel?: boolean;
  /**
   * Whether nested relation fetches should pass `setCache: true` (default true).
   */
  setCache?: boolean;
};

const DEFAULTS: Required<ComposeOptions> = {
  maxDepth: 10,
  parallel: true,
  setCache: true,
};

let globalComposeOptions: Required<ComposeOptions> = { ...DEFAULTS };

export function setComposeOptions(options: ComposeOptions | undefined): void {
  globalComposeOptions = {
    ...DEFAULTS,
    ...options,
  };
}

export function getComposeOptions(): Required<ComposeOptions> {
  return globalComposeOptions;
}

export function mergeComposeOptions(
  overrides?: ComposeOptions,
): Required<ComposeOptions> {
  if (!overrides) return globalComposeOptions;
  return { ...globalComposeOptions, ...overrides };
}
