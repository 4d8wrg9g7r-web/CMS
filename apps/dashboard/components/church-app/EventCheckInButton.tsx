"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Clock } from "lucide-react";

/**
 * Member self check-in on an event card (docs/domain/app.md "Check-in").
 * The window runs from an hour before the occurrence until it ends. Before it
 * opens, a passive hint says when (in the church's timezone); a minute tick
 * keeps long-lived pages honest; a member already checked in sees that state
 * on load instead of the button (UX audit #10). Location is requested only at
 * the moment of tapping — never before — and check-in proceeds if declined.
 */
export function EventCheckInButton({
  publicAppId,
  eventId,
  occurrenceAt,
  endsAt,
  signedIn,
  accent,
  timeZone,
  initiallyCheckedIn = false,
}: {
  publicAppId: string;
  eventId: string;
  occurrenceAt: string;
  endsAt: string | null;
  signedIn: boolean;
  accent: string;
  timeZone: string;
  initiallyCheckedIn?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(initiallyCheckedIn ? "done" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The window opens and closes while the app sits on a phone — re-evaluate
  // every minute instead of freezing at render time.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const start = new Date(occurrenceAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 2 * 3600 * 1000;
  if (Number.isNaN(start) || now > end) return null;

  if (state === "done") {
    return (
      <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-700" data-app-checkin-done>
        <CircleCheck size={16} style={{ color: accent }} /> Checked in
      </p>
    );
  }

  const opensAt = start - 3600 * 1000;
  if (now < opensAt) {
    const opensLabel = new Date(opensAt).toLocaleTimeString("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    });
    return (
      <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-neutral-100 px-4 py-2.5 text-sm text-neutral-500" data-app-checkin-preview>
        <Clock size={14} /> Check-in opens at {opensLabel}
      </p>
    );
  }

  if (!signedIn) {
    return (
      <a
        href={`/a/${publicAppId}/signin`}
        className="mt-3 block rounded-xl border px-4 py-2.5 text-center text-sm font-semibold"
        style={{ borderColor: accent, color: accent }}
        data-app-checkin-signin
      >
        Sign in to check in
      </a>
    );
  }

  const position = () =>
    new Promise<{ latitude: number | null; longitude: number | null }>((resolve) => {
      if (!("geolocation" in navigator)) return resolve({ latitude: null, longitude: null });
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve({ latitude: null, longitude: null }),
        { timeout: 8000, maximumAge: 60000 },
      );
    });

  const checkIn = async () => {
    setState("busy");
    setMessage(null);
    try {
      const coords = await position();
      const res = await fetch(`/api/app/v1/apps/${publicAppId}/checkin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event_id: eventId, occurrence_at: occurrenceAt, ...coords }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setState("error");
        setMessage(data.error === "outside_window" ? "Check-in isn't open right now." : "Check-in didn't go through.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("Check-in didn't go through.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void checkIn()}
        disabled={state === "busy"}
        className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: accent }}
        data-app-checkin
      >
        {state === "busy" ? "Checking in…" : "I'm here — check in"}
      </button>
      {message && <p className="mt-1.5 text-center text-xs text-red-600" data-app-checkin-error>{message}</p>}
    </>
  );
}
