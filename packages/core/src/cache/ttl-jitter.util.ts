/**
 * Adds random jitter to a TTL to prevent mass expiry at the same instant.
 * Returns an integer TTL within ±percent of the base value (minimum 1).
 * Rounds the range down so short TTLs are not stretched past `percent`
 * (ceil made `ttl: 2` land anywhere in 1..3s, i.e. ±50%).
 */
export function applyJitter(ttl: number, percent = 10): number {
  const range = Math.floor(ttl * (percent / 100));
  const jitter = Math.floor(Math.random() * (range * 2 + 1)) - range;
  return Math.max(1, ttl + jitter);
}
