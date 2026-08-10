"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { buttonClasses } from "../components/ui/Button";

/** Catches errors on every route outside the (dashboard) group -- marketing, auth, signup, public prayer wall, widget embed -- none of which had any error boundary before this, so a thrown Server Action error there fell through to Next.js's bare default error page. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <AlertTriangle size={32} strokeWidth={1.5} className="text-ink-muted" />
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="max-w-sm text-sm text-ink-secondary">An unexpected error occurred. Your data is safe -- try again.</p>
      <button type="button" onClick={() => reset()} className={buttonClasses("secondary", "sm")}>
        Try again
      </button>
    </main>
  );
}
