/**
 * Pure attendance-aggregation helpers (docs/domain/attendance.md). The service fetches
 * slim CheckIn rows; everything statistical happens here so it's unit-testable. Weeks
 * start on Sunday, computed in UTC to match occurrenceAt's UTC instants.
 */

export interface AttendanceRow {
  occurrenceAt: Date;
  eventId: string;
  personId: string | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The UTC midnight of the Sunday on or before the given instant. */
export function weekStart(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(day.getTime() - day.getUTCDay() * 24 * 60 * 60 * 1000);
}

export interface WeekBucket {
  weekStart: Date;
  count: number;
}

/**
 * Buckets rows into consecutive Sunday-started weeks ending with the week containing
 * `now`. Always returns exactly `weeks` buckets, oldest first, empty weeks included —
 * a trend chart needs the gaps, not just the hits.
 */
export function weeklyBuckets(rows: AttendanceRow[], weeks: number, now: Date): WeekBucket[] {
  const lastWeek = weekStart(now).getTime();
  const firstWeek = lastWeek - (weeks - 1) * WEEK_MS;
  const counts = new Map<number, number>();
  for (const row of rows) {
    const key = weekStart(row.occurrenceAt).getTime();
    if (key < firstWeek || key > lastWeek) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buckets: WeekBucket[] = [];
  for (let t = firstWeek; t <= lastWeek; t += WEEK_MS) {
    buckets.push({ weekStart: new Date(t), count: counts.get(t) ?? 0 });
  }
  return buckets;
}

export interface EventAttendanceSummary {
  eventId: string;
  total: number;
  occurrenceCount: number;
  averagePerOccurrence: number;
  lastOccurrenceAt: Date;
  lastOccurrenceCount: number;
}

/** Per-event totals over the row set, sorted by total descending. */
export function summarizeByEvent(rows: AttendanceRow[]): EventAttendanceSummary[] {
  const byEvent = new Map<string, Map<number, number>>();
  for (const row of rows) {
    let occurrences = byEvent.get(row.eventId);
    if (!occurrences) {
      occurrences = new Map();
      byEvent.set(row.eventId, occurrences);
    }
    const key = row.occurrenceAt.getTime();
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }
  const summaries: EventAttendanceSummary[] = [];
  for (const [eventId, occurrences] of byEvent) {
    let total = 0;
    let lastKey = Number.NEGATIVE_INFINITY;
    for (const [key, count] of occurrences) {
      total += count;
      if (key > lastKey) lastKey = key;
    }
    summaries.push({
      eventId,
      total,
      occurrenceCount: occurrences.size,
      averagePerOccurrence: Math.round((total / occurrences.size) * 10) / 10,
      lastOccurrenceAt: new Date(lastKey),
      lastOccurrenceCount: occurrences.get(lastKey) ?? 0,
    });
  }
  return summaries.sort((a, b) => b.total - a.total);
}

/** Distinct people across rows; guest rows (personId null) never count as people. */
export function countUniquePeople(rows: AttendanceRow[]): number {
  const people = new Set<string>();
  for (const row of rows) {
    if (row.personId) people.add(row.personId);
  }
  return people.size;
}
