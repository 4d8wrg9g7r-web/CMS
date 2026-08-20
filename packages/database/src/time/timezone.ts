/**
 * Timezone-aware time handling (UX audit #1). Everything is stored as UTC
 * instants; these helpers convert to and from the organization's IANA
 * timezone for display and for form input. Pure Intl-based — no tz library,
 * no server-locale dependence.
 */

/** Zones offered in the settings picker; any valid IANA id is accepted too. */
export const COMMON_TIMEZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Puerto_Rico",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "Atlantic/Azores",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Athens",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

export const DEFAULT_TIMEZONE = "UTC";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockIn(date: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24, // Intl reports midnight as 24 in some engines
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * The UTC instant whose wall clock in `timeZone` reads as the given fields.
 * Two fixed-point passes handle DST offsets; a nonexistent wall time (the
 * spring-forward gap) resolves to the instant the clock actually shows.
 */
export function zonedTimeToUtc(wall: Omit<WallClock, "second"> & { second?: number }, timeZone: string): Date {
  const desired = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second ?? 0);
  let t = desired;
  for (let i = 0; i < 2; i++) {
    const p = wallClockIn(new Date(t), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    t -= shown - desired;
  }
  return new Date(t);
}

/** UTC instant → "YYYY-MM-DDTHH:mm" wall clock in tz (datetime-local value). */
export function toDateTimeLocalValue(date: Date, timeZone: string): string {
  const p = wallClockIn(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DDTHH:mm[:ss]" typed in tz → UTC instant; null when malformed. */
export function parseDateTimeLocalValue(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  const date = zonedTimeToUtc(
    { year: Number(y), month: Number(mo), day: Number(d), hour: Number(hh), minute: Number(mm), second: Number(ss ?? 0) },
    timeZone,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "YYYY-MM-DD" in tz → the last instant of that day (for repeats-until). */
export function endOfDayInTimeZone(dateStr: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  return zonedTimeToUtc(
    { year: Number(y), month: Number(mo), day: Number(d), hour: 23, minute: 59, second: 59 },
    timeZone,
  );
}

/** The UTC instants bounding "today" (or `at`'s day) in tz. DST-safe: the
 * end is the next calendar day's midnight, not start+24h. */
export function dayRangeInTimeZone(timeZone: string, at: Date = new Date()): { start: Date; end: Date } {
  const p = wallClockIn(at, timeZone);
  const start = zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 }, timeZone);
  // Date.UTC normalizes day overflow (Jan 32 → Feb 1), giving the next calendar day.
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = zonedTimeToUtc(
    { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0 },
    timeZone,
  );
  return { start, end };
}

/** Display formatting pinned to the org's zone (never the server's). */
export function formatInTimeZone(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
}

export function formatTimeShort(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, { hour: "numeric", minute: "2-digit" });
}

export function formatDateTimeShort(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
