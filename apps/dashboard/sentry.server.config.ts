import * as Sentry from "@sentry/nextjs";

/**
 * Error tracking only, no performance tracing (tracesSampleRate: 0) -- keeps this
 * comfortably inside Sentry's free tier, which is generous on error volume but
 * meters performance/tracing separately. Bump this later if performance monitoring
 * becomes worth the quota.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
