"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Mail, User, X } from "lucide-react";
import { Badge } from "./ui/Badge";
import { buttonClasses } from "./ui/Button";
import { Inspector } from "./ui/Inspector";
import { cancelRegistrationAction } from "../app/(dashboard)/events/actions";

/**
 * Registration rows on the event detail page. Clicking a row opens the
 * Inspector (docs/design-system.md "Inspector") with the registrant's
 * details and the actions that make sense there — view profile, email,
 * cancel — instead of forcing a page navigation for a micro-task. The
 * cancel action is the same permission-gated server action as before.
 */

export interface RegistrationRow {
  id: string;
  personId: string | null;
  displayName: string;
  email: string | null;
  status: string;
  createdAt: string; // ISO
}

function registeredOn(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function EventRegistrationList({ eventId, eventTitle, rows }: { eventId: string; eventTitle: string; rows: RegistrationRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Look the row up from props so a cancel (server revalidation) is
  // reflected in the open inspector immediately.
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const cancel = (registrationId: string) => {
    startTransition(async () => {
      await cancelRegistrationAction(eventId, registrationId);
    });
  };

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((registration) => (
          <li key={registration.id}>
            <button
              type="button"
              onClick={() => setSelectedId(registration.id)}
              data-registration-row={registration.id}
              className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2.5 text-left text-sm transition-colors duration-180 hover:bg-surface-muted"
            >
              <div className="min-w-0">
                <span className="block truncate font-medium text-ink">{registration.displayName}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {registration.email ?? "no email"} · {new Date(registration.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {registration.status === "CANCELLED" ? <Badge variant="warning">Cancelled</Badge> : <Badge variant="success">Registered</Badge>}
                <ChevronRight size={15} className="text-ink-muted" />
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Inspector open={selected !== null} onClose={() => setSelectedId(null)} title="Registration">
        {selected && (
          <div className="flex h-full flex-col" data-section="registration-inspector">
            <div>
              <p className="text-display text-[22px] leading-tight text-ink">{selected.displayName}</p>
              <p className="mt-1 text-sm text-ink-secondary">{eventTitle}</p>
              <div className="mt-3">
                {selected.status === "CANCELLED" ? <Badge variant="warning">Cancelled</Badge> : <Badge variant="success">Registered</Badge>}
              </div>
            </div>

            <dl className="mt-6 space-y-4 border-t border-border pt-5 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">Email</dt>
                <dd className="mt-0.5 text-ink">{selected.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">Registered</dt>
                <dd className="mt-0.5 text-ink">{registeredOn(selected.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">Profile</dt>
                <dd className="mt-0.5 text-ink">{selected.personId ? "Linked to a person record" : "Guest registration — no profile"}</dd>
              </div>
            </dl>

            <div className="mt-auto space-y-2.5 border-t border-border pt-5">
              {selected.personId && (
                <Link href={`/people/${selected.personId}`} className={buttonClasses("secondary", "sm") + " w-full"}>
                  <User size={14} /> View profile
                </Link>
              )}
              {selected.email && (
                <a href={`mailto:${selected.email}`} className={buttonClasses("secondary", "sm") + " w-full"}>
                  <Mail size={14} /> Email {selected.displayName.split(" ")[0]}
                </a>
              )}
              {selected.status !== "CANCELLED" && (
                <button
                  type="button"
                  onClick={() => cancel(selected.id)}
                  disabled={isPending}
                  data-action="cancel-registration"
                  className={buttonClasses("danger", "sm") + " w-full disabled:opacity-60"}
                >
                  <X size={14} /> {isPending ? "Cancelling…" : "Cancel registration"}
                </button>
              )}
            </div>
          </div>
        )}
      </Inspector>
    </>
  );
}
