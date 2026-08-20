"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import { ActionForm } from "./ui/ActionForm";
import { SubmitButton } from "./ui/SubmitButton";
import type { ActionResult } from "../lib/action-result";

/**
 * First-run nudge (UX audit #1): until a timezone is set, every time in the
 * product renders in UTC. Offers the browser-detected zone one click away.
 */
export function TimezoneBanner({ action }: { action: (formData: FormData) => Promise<ActionResult> }) {
  const [detected, setDetected] = useState<string | null>(null);
  useEffect(() => {
    try {
      setDetected(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setDetected(null);
    }
  }, []);

  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning-bg px-5 py-2.5 text-sm text-ink"
      data-timezone-banner
    >
      <Globe size={15} className="shrink-0 text-warning" />
      <span className="min-w-0">
        Times are currently shown in UTC — set your church&rsquo;s timezone so events and check-ins read correctly.
      </span>
      {detected && (
        <ActionForm action={action} className="inline-flex">
          <input type="hidden" name="timezone" value={detected} />
          <SubmitButton size="sm" variant="secondary" pendingLabel="Setting…">
            Use {detected.replaceAll("_", " ")}
          </SubmitButton>
        </ActionForm>
      )}
      <Link href="/settings" className="text-accent hover:underline">
        Pick another in Settings
      </Link>
    </div>
  );
}
