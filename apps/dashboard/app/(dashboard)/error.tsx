"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { EmptyState } from "../../components/ui/EmptyState";
import { buttonClasses } from "../../components/ui/Button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <EmptyState
      bare={false}
      icon={<AlertTriangle size={28} strokeWidth={1.5} />}
      title="Something went wrong"
      description="An unexpected error occurred loading this page. Your data is safe -- try again."
      action={
        <button type="button" onClick={() => reset()} className={buttonClasses("secondary", "sm")}>
          Try again
        </button>
      }
    />
  );
}
