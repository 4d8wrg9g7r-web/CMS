/**
 * In-memory sliding-window rate limiter. Single-process only -- it does not share
 * state across multiple server instances or serverless invocations. That's an
 * acceptable gap for the current single-instance deployment model, but would need
 * Redis (or similar shared store) to hold at real multi-instance scale. Documented
 * as a known limitation, not silently assumed away -- see docs/security.md.
 */
const buckets = new Map<string, number[]>();

let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** Drops buckets with no timestamps inside any plausible window, so long-idle visitors don't leak memory forever. */
function sweepStaleBuckets(maxWindowMs: number) {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of buckets) {
    const fresh = timestamps.filter((t) => now - t < maxWindowMs);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  sweepStaleBuckets(windowMs);

  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    const retryAfterMs = windowMs - (now - timestamps[0]!);
    buckets.set(key, timestamps);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return { allowed: true };
}

/**
 * Best-effort client IP from standard proxy headers -- absent in some local/dev
 * setups, callers must handle null. Accepts a plain Headers object (not a full
 * Request) so it works both from API routes (`getClientIp(req.headers)`) and from
 * Server Actions, which have no Request object of their own (`getClientIp(await headers())`).
 */
export function getClientIp(headers: Pick<Headers, "get">): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}
