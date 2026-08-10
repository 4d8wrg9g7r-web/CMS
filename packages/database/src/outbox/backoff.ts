/**
 * Pure retry-backoff schedule for the outbox worker (BLUEPRINT §38 "retries"). Kept free
 * of Date/random so it unit-tests deterministically. `attempts` is the number of attempts
 * already made (1 after the first failure). Exponential with a cap.
 */
export function computeBackoff(attempts: number, baseMs = 1000, capMs = 5 * 60 * 1000): number {
  if (attempts <= 0) return 0;
  const exponent = Math.min(attempts - 1, 30); // guard against overflow on absurd inputs
  return Math.min(capMs, baseMs * 2 ** exponent);
}
