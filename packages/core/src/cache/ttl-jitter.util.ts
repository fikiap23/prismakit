/**
 * Adds random jitter to a TTL to prevent mass expiry at the same instant.
 * Returns an integer TTL ±percent of the base value (minimum 1).
 */
export function applyJitter(ttl: number, percent = 10): number {
  const range = Math.ceil(ttl * (percent / 100));
  const jitter = Math.floor(Math.random() * (range * 2 + 1)) - range;
  return Math.max(1, ttl + jitter);
}
