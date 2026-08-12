/**
 * In CI (or when FORCE_INTEGRATION=1), integration suites must not silently skip.
 * Locally, suites still skip when DATABASE_URL / REDIS_URL are unset.
 */
export function requireEnv(name: 'DATABASE_URL' | 'REDIS_URL'): string | undefined {
  const value = process.env[name];
  if (value) return value;
  const force =
    process.env.FORCE_INTEGRATION === '1' || process.env.CI === 'true';
  if (force) {
    throw new Error(
      `[PrismaKit] ${name} is required for integration tests when CI=true or FORCE_INTEGRATION=1`,
    );
  }
  return undefined;
}
