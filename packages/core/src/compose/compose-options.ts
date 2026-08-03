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
   * Parent reads with `setCache: false` / active `tx` should override this.
   */
  setCache?: boolean;
  /**
   * Transaction client forwarded to nested `getMany` calls so compose sees
   * uncommitted rows and bypasses cache inside transactions.
   */
  tx?: unknown;
};

export type ResolvedComposeOptions = {
  maxDepth: number;
  parallel: boolean;
  setCache: boolean;
  tx?: unknown;
};

const DEFAULTS: ResolvedComposeOptions = {
  maxDepth: 10,
  parallel: true,
  setCache: true,
  tx: undefined,
};

let globalComposeOptions: ResolvedComposeOptions = { ...DEFAULTS };

export function setComposeOptions(options: ComposeOptions | undefined): void {
  globalComposeOptions = {
    ...DEFAULTS,
    ...options,
    tx: undefined, // tx is always per-call
  };
}

export function getComposeOptions(): ResolvedComposeOptions {
  return globalComposeOptions;
}

export function mergeComposeOptions(
  overrides?: ComposeOptions,
): ResolvedComposeOptions {
  if (!overrides) return { ...globalComposeOptions };
  return { ...globalComposeOptions, ...overrides };
}
