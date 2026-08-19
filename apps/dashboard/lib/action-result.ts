/**
 * Result contract for form-bound server actions (ADR: UX feedback pass).
 * Validation problems come back as data — never thrown — so forms can render
 * field errors inline and keep what the user typed. Throwing is reserved for
 * genuinely exceptional failures (auth, missing org), which the framework
 * turns into the error boundary.
 */

export type ActionResult =
  | { ok: true; message?: string; redirectTo?: string }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> };

export function ok(message?: string, redirectTo?: string): ActionResult {
  return { ok: true, ...(message ? { message } : {}), ...(redirectTo ? { redirectTo } : {}) };
}

export function fail(formError: string): ActionResult {
  return { ok: false, formError };
}

export function invalid(fieldErrors: Record<string, string>): ActionResult {
  return { ok: false, fieldErrors };
}
