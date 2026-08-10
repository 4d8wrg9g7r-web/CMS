import { withSentryConfig } from "@sentry/nextjs";

/**
 * Prisma's generated query engine binary (a native .so.node addon, not a JS import)
 * lives deep in pnpm's virtual store and Next's output-file-tracing doesn't reliably
 * follow it there -- without this, `prisma.*` calls fail at runtime on Vercel with
 * "could not locate the Query Engine" even though the client builds successfully
 * (the binary just isn't in the deployed function's bundle).
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@cms/ai",
    "@cms/database",
    "@cms/email",
    "@cms/providers",
    "@cms/retrieval",
    "@cms/shared-types",
  ],
  outputFileTracingIncludes: {
    "/**": ["../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*"],
  },
};

// Source-map upload (SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN) is intentionally
// left unset -- readable stack traces are a nice-to-have, not worth a second Sentry
// secret on top of the DSN for a free-tier setup. withSentryConfig degrades
// gracefully (skips the upload step) when they're missing.
export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  webpack: { automaticVercelMonitors: false },
});
