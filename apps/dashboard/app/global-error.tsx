"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Catches errors thrown by the root layout itself, which a regular error.tsx can't
 * -- necessarily replaces <html>/<body> entirely, so kept minimal and independent
 * of the design system (globals.css may not have loaded if layout.tsx itself broke).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ maxWidth: 380, fontSize: 14, color: "#666" }}>An unexpected error occurred. Your data is safe -- try again.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ borderRadius: 6, border: "1px solid #ccc", padding: "6px 14px", fontSize: 14, background: "white", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
