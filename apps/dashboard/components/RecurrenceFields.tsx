"use client";

import { useState } from "react";
import { Input, Select } from "./ui/Input";
import { RECURRENCE_OPTIONS } from "../lib/events-format";

/**
 * Recurrence controls for the event form (UX audit #11): interval and
 * end-date exist only when the event actually repeats, and the interval's
 * unit follows the chosen cadence ("Every __ weeks") instead of the
 * unit-ambiguous "Every N days/weeks/months".
 */
const UNIT_PLURAL: Record<string, string> = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months" };

export function RecurrenceFields({
  recurrence: initialRecurrence,
  interval,
  untilValue,
}: {
  recurrence: string;
  interval: number;
  untilValue: string;
}) {
  const [recurrence, setRecurrence] = useState(initialRecurrence || "NONE");
  const repeats = recurrence !== "NONE";

  return (
    <>
      <label className="text-sm text-ink-secondary">
        Repeats
        <Select name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="mt-1">
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      {repeats ? (
        <label className="text-sm text-ink-secondary" data-recurrence-interval>
          Every
          <span className="mt-1 flex items-center gap-2">
            <Input name="recurrenceInterval" type="number" min={1} defaultValue={interval} className="w-20" />
            <span className="text-ink-secondary">{UNIT_PLURAL[recurrence] ?? "times"}</span>
          </span>
        </label>
      ) : (
        // Keep the value in the payload so switching back and forth is lossless.
        <input type="hidden" name="recurrenceInterval" value={interval} />
      )}
      {repeats ? (
        <label className="text-sm text-ink-secondary" data-recurrence-until>
          Repeats until <span className="text-ink-muted">(blank = no end)</span>
          <Input name="recurrenceUntil" type="date" defaultValue={untilValue} className="mt-1" />
        </label>
      ) : (
        <input type="hidden" name="recurrenceUntil" value="" />
      )}
    </>
  );
}
