import * as Sentry from "@sentry/nextjs";

/**
 * Covers middleware.ts and any edge routes -- @sentry/nextjs ships an edge-safe
 * entrypoint specifically for this file, unlike the Prisma client (see auth.ts's
 * doc comments elsewhere in this codebase for that constraint), so this is safe to
 * import from the Edge runtime.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
