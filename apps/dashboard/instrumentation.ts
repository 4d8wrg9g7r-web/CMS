import * as Sentry from "@sentry/nextjs";

/** Next.js's native instrumentation hook -- loads the right Sentry init for whichever runtime this server process actually is. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
