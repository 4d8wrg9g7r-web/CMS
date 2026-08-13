"use client";

import { useState } from "react";

/**
 * The kiosk flow (docs/domain/app.md "Check-in"): pick today's service →
 * exact phone/last-name lookup → tap the kids → check in → labels print.
 * The print sheet is a 62mm-wide layout (Brother QL continuous tape); in
 * Chrome kiosk mode (--kiosk --kiosk-printing) window.print() is silent.
 */

interface KioskEvent {
  id: string;
  title: string;
  occurrenceAt: string;
  timeLabel: string;
}
interface HouseholdHit {
  id: string;
  name: string;
  kids: { id: string; name: string }[];
}
interface CheckInResult {
  eventTitle: string;
  checkIns: { personId: string; name: string; securityCode: string }[];
}

export function KioskScreen({
  kioskKey,
  kioskName,
  organizationName,
  calendarName,
  events,
}: {
  kioskKey: string;
  kioskName: string;
  organizationName: string;
  calendarName: string | null;
  events: KioskEvent[];
}) {
  const [mode, setMode] = useState<"checkin" | "pickup">("checkin");
  const [eventKey, setEventKey] = useState(events[0] ? `${events[0].id}|${events[0].occurrenceAt}` : "");
  const [query, setQuery] = useState("");
  const [households, setHouseholds] = useState<HouseholdHit[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [pickupCode, setPickupCode] = useState("");
  const [pickedUp, setPickedUp] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = `/api/kiosk/${kioskKey}`;
  const active = events.find((e) => `${e.id}|${e.occurrenceAt}` === eventKey) ?? null;

  const lookup = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "lookup", query }),
      });
      const data = (await res.json()) as { households?: HouseholdHit[] };
      setHouseholds(data.households ?? []);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async () => {
    if (!active || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "checkin", eventId: active.id, occurrenceAt: active.occurrenceAt, personIds: [...selected] }),
      });
      const data = (await res.json()) as CheckInResult & { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Check-in failed");
        return;
      }
      setResult(data);
      // Labels: silent in Chrome kiosk-printing mode; a dialog elsewhere.
      setTimeout(() => window.print(), 300);
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    if (!active || selected.size === 0 || pickupCode.trim().length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const names: string[] = [];
      for (const personId of selected) {
        const res = await fetch(api, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            op: "checkout",
            eventId: active.id,
            occurrenceAt: active.occurrenceAt,
            personId,
            securityCode: pickupCode,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(
            data.error === "code_mismatch"
              ? "That code doesn't match — check the guardian receipt."
              : "No open check-in found for that child.",
          );
          return;
        }
        const kid = households?.flatMap((h) => h.kids).find((k) => k.id === personId);
        names.push(kid?.name ?? "Child");
      }
      setPickedUp(names);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setQuery("");
    setHouseholds(null);
    setSelected(new Set());
    setResult(null);
    setPickupCode("");
    setPickedUp([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #kiosk-labels, #kiosk-labels * { visibility: visible; }
          #kiosk-labels { position: absolute; left: 0; top: 0; width: 62mm; }
          @page { size: 62mm 100mm; margin: 3mm; }
        }
      `}</style>

      <div className="mx-auto max-w-xl px-6 py-10 print:hidden">
        <p className="text-sm font-semibold text-slate-400">
          {organizationName} · {kioskName}
          {calendarName ? ` · ${calendarName}` : ""}
        </p>

        {pickedUp.length > 0 ? (
          <div className="mt-10 text-center" data-kiosk-pickup-success>
            <p className="text-4xl">👋</p>
            <h1 className="mt-3 text-3xl font-bold">Checked out</h1>
            <p className="mt-2 text-slate-300">{pickedUp.join(", ")} — have a great day!</p>
            <button type="button" onClick={reset} className="mt-8 rounded-xl bg-white px-6 py-3 text-lg font-semibold text-slate-900" data-kiosk-done>
              Done
            </button>
          </div>
        ) : result ? (
          <div className="mt-10 text-center" data-kiosk-success>
            <p className="text-4xl">✅</p>
            <h1 className="mt-3 text-3xl font-bold">You&rsquo;re all set!</h1>
            <p className="mt-2 text-slate-300">
              {result.checkIns.map((c) => c.name).join(", ")} checked in to {result.eventTitle}.
            </p>
            <p className="mt-4 text-lg">
              Pickup code: <span className="font-mono text-2xl font-bold" data-kiosk-code>{result.checkIns[0]?.securityCode}</span>
            </p>
            <p className="mt-1 text-sm text-slate-400">Keep your receipt — it&rsquo;s required at pickup.</p>
            <button type="button" onClick={reset} className="mt-8 rounded-xl bg-white px-6 py-3 text-lg font-semibold text-slate-900" data-kiosk-done>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-3">
              <h1 className="text-3xl font-bold" data-kiosk-title>
                {mode === "checkin" ? "Check in" : "Pickup"}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "checkin" ? "pickup" : "checkin");
                  setSelected(new Set());
                  setPickupCode("");
                  setError(null);
                }}
                className="rounded-full bg-slate-800 px-4 py-1.5 text-sm font-semibold text-slate-200"
                data-kiosk-mode
              >
                {mode === "checkin" ? "Picking up? →" : "← Back to check-in"}
              </button>
            </div>

            {events.length === 0 ? (
              <p className="mt-6 text-slate-300" data-kiosk-noevents>
                Nothing on today&rsquo;s calendar — check back at service time.
              </p>
            ) : (
              <>
                <div className="mt-5 flex flex-wrap gap-2" data-kiosk-events>
                  {events.map((e) => {
                    const key = `${e.id}|${e.occurrenceAt}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setEventKey(key)}
                        className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                          eventKey === key ? "bg-white text-slate-900" : "bg-slate-800 text-slate-200"
                        }`}
                      >
                        {e.title} · {e.timeLabel}
                      </button>
                    );
                  })}
                </div>

                <form
                  className="mt-6 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void lookup();
                  }}
                >
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Phone number or last name"
                    className="min-w-0 flex-1 rounded-xl border-0 bg-slate-800 px-4 py-3.5 text-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/60"
                    data-kiosk-query
                  />
                  <button type="submit" disabled={busy || query.trim().length < 3} className="rounded-xl bg-white px-5 py-3.5 text-lg font-semibold text-slate-900 disabled:opacity-40" data-kiosk-search>
                    Find
                  </button>
                </form>

                {households !== null && (
                  <div className="mt-6 space-y-4" data-kiosk-results>
                    {households.length === 0 ? (
                      <p className="text-slate-300">No family found — check with a volunteer.</p>
                    ) : (
                      households.map((h) => (
                        <div key={h.id} className="rounded-xl bg-slate-800 p-4">
                          <p className="mb-2 text-sm font-semibold text-slate-300">{h.name}</p>
                          {h.kids.length === 0 ? (
                            <p className="text-sm text-slate-400">No children on file for this family.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {h.kids.map((kid) => (
                                <button
                                  key={kid.id}
                                  type="button"
                                  data-kiosk-kid={kid.id}
                                  onClick={() =>
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(kid.id)) next.delete(kid.id);
                                      else next.add(kid.id);
                                      return next;
                                    })
                                  }
                                  className={`rounded-xl px-4 py-2.5 text-base font-semibold ${
                                    selected.has(kid.id) ? "bg-emerald-400 text-slate-900" : "bg-slate-700 text-white"
                                  }`}
                                >
                                  {kid.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    {selected.size > 0 && mode === "checkin" && (
                      <button type="button" onClick={() => void checkIn()} disabled={busy} className="w-full rounded-xl bg-emerald-400 px-6 py-4 text-xl font-bold text-slate-900 disabled:opacity-50" data-kiosk-checkin>
                        {busy ? "Checking in…" : `Check in ${selected.size} ${selected.size === 1 ? "child" : "kids"}`}
                      </button>
                    )}
                    {selected.size > 0 && mode === "pickup" && (
                      <div className="space-y-2">
                        <input
                          value={pickupCode}
                          onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                          placeholder="Pickup code (e.g. ACD-42)"
                          className="w-full rounded-xl border-0 bg-slate-800 px-4 py-3.5 text-center font-mono text-xl tracking-widest text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/60"
                          data-kiosk-pickup-code
                        />
                        <button
                          type="button"
                          onClick={() => void checkOut()}
                          disabled={busy || pickupCode.trim().length < 4}
                          className="w-full rounded-xl bg-emerald-400 px-6 py-4 text-xl font-bold text-slate-900 disabled:opacity-50"
                          data-kiosk-checkout
                        >
                          {busy ? "Verifying…" : "Verify & check out"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {error && <p className="mt-4 text-sm text-red-400" data-kiosk-error>{error}</p>}
              </>
            )}
          </>
        )}
      </div>

      {/* Label sheet: one child tag per check-in + one guardian receipt. */}
      {result && (
        <div id="kiosk-labels" className="hidden print:block" data-kiosk-labels>
          {result.checkIns.map((c) => (
            <div key={c.personId} style={{ pageBreakAfter: "always", color: "#000", fontFamily: "system-ui" }}>
              <div style={{ fontSize: "22pt", fontWeight: 800 }}>{c.name}</div>
              <div style={{ fontSize: "11pt", marginTop: "2mm" }}>{result.eventTitle}</div>
              <div style={{ fontSize: "20pt", fontWeight: 800, marginTop: "4mm", letterSpacing: "1px" }}>{c.securityCode}</div>
              <div style={{ fontSize: "8pt", marginTop: "2mm" }}>{organizationName}</div>
            </div>
          ))}
          <div style={{ color: "#000", fontFamily: "system-ui" }}>
            <div style={{ fontSize: "13pt", fontWeight: 800 }}>Guardian receipt</div>
            <div style={{ fontSize: "10pt", marginTop: "2mm" }}>{result.checkIns.map((c) => c.name).join(", ")}</div>
            <div style={{ fontSize: "22pt", fontWeight: 800, marginTop: "4mm", letterSpacing: "1px" }}>
              {result.checkIns[0]?.securityCode}
            </div>
            <div style={{ fontSize: "8pt", marginTop: "2mm" }}>Required at pickup · {result.eventTitle}</div>
          </div>
        </div>
      )}
    </div>
  );
}
