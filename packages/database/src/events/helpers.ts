import { EventRecurrence } from "@prisma/client";

/**
 * Pure recurrence expansion (docs/domain/events.md "Recurrence strategy"). No Prisma
 * access — unit-tests without a database. Compute-on-read: the rule lives on the Event;
 * this derives concrete occurrence start times inside a window. Occurrence ROWS
 * materialize later when Check-In needs per-occurrence attendance.
 */

export interface RecurrenceFields {
  startAt: Date;
  recurrence: EventRecurrence;
  /** Every N days/weeks/months (min 1). */
  recurrenceInterval: number;
  /** Inclusive end bound for the series (null = unbounded). */
  recurrenceUntil?: Date | null;
}

const HARD_ITERATION_CAP = 1000;

/**
 * Occurrence start times within [windowStart, windowEnd], capped at `limit`. A NONE
 * event yields its single startAt when it falls in the window. MONTHLY recurs on the
 * start date's day-of-month; months lacking that day (e.g. the 31st) are SKIPPED, not
 * shifted — deterministic and documented.
 */
export function expandOccurrences(
  event: RecurrenceFields,
  windowStart: Date,
  windowEnd: Date,
  limit = 50,
): Date[] {
  if (windowEnd < windowStart || limit <= 0) return [];
  const interval = Math.max(1, Math.floor(event.recurrenceInterval || 1));
  const until = event.recurrenceUntil ?? null;
  const inWindow = (d: Date) =>
    d >= windowStart && d <= windowEnd && (!until || d <= until);

  if (event.recurrence === EventRecurrence.NONE) {
    return inWindow(event.startAt) ? [event.startAt] : [];
  }

  const occurrences: Date[] = [];
  const startDay = event.startAt.getUTCDate();

  for (let i = 0; i < HARD_ITERATION_CAP && occurrences.length < limit; i++) {
    let occurrence: Date;
    if (event.recurrence === EventRecurrence.MONTHLY) {
      const candidate = new Date(event.startAt);
      candidate.setUTCMonth(candidate.getUTCMonth() + i * interval);
      // JS Date rolls over (Jan 31 + 1 month = Mar 3); detect and skip such months.
      if (candidate.getUTCDate() !== startDay) continue;
      occurrence = candidate;
    } else {
      const stepDays = event.recurrence === EventRecurrence.WEEKLY ? 7 * interval : interval;
      occurrence = new Date(event.startAt.getTime() + i * stepDays * 24 * 60 * 60 * 1000);
    }

    if (until && occurrence > until) break;
    if (occurrence > windowEnd) break;
    if (occurrence >= windowStart) occurrences.push(occurrence);
  }

  return occurrences;
}

/** The next occurrence at or after `from`, or null when the series has ended. */
export function nextOccurrence(event: RecurrenceFields, from: Date = new Date()): Date | null {
  // A generous forward window; a series with an occurrence further out than 5 years is
  // out of scope for display purposes.
  const horizon = new Date(from.getTime() + 5 * 365 * 24 * 60 * 60 * 1000);
  const [first] = expandOccurrences(event, from, horizon, 1);
  return first ?? null;
}
