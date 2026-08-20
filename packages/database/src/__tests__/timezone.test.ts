import { describe, expect, it } from "vitest";
import {
  dayRangeInTimeZone,
  endOfDayInTimeZone,
  formatDateTimeShort,
  formatTimeShort,
  isValidTimeZone,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
  zonedTimeToUtc,
} from "../time/timezone";

const CHI = "America/Chicago";

describe("timezone helpers", () => {
  it("validates IANA ids", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("round-trips a datetime-local value through a zone", () => {
    // 9:00 AM Chicago in August is 14:00 UTC (CDT, -5).
    const instant = parseDateTimeLocalValue("2026-08-23T09:00", CHI)!;
    expect(instant.toISOString()).toBe("2026-08-23T14:00:00.000Z");
    expect(toDateTimeLocalValue(instant, CHI)).toBe("2026-08-23T09:00");
  });

  it("uses the winter offset after the DST fall-back", () => {
    // 9:00 AM Chicago in December is 15:00 UTC (CST, -6).
    const instant = parseDateTimeLocalValue("2026-12-06T09:00", CHI)!;
    expect(instant.toISOString()).toBe("2026-12-06T15:00:00.000Z");
    expect(toDateTimeLocalValue(instant, CHI)).toBe("2026-12-06T09:00");
  });

  it("resolves the nonexistent spring-forward hour to a real instant", () => {
    // 2:30 AM on 2026-03-08 does not exist in Chicago (clocks jump 2→3).
    const instant = parseDateTimeLocalValue("2026-03-08T02:30", CHI)!;
    expect(Number.isNaN(instant.getTime())).toBe(false);
    // The resolved instant must sit inside the transition window.
    expect(instant.toISOString()).toMatch(/^2026-03-08T0[78]:30/);
  });

  it("rejects malformed input", () => {
    expect(parseDateTimeLocalValue("not-a-date", CHI)).toBeNull();
    expect(parseDateTimeLocalValue("2026-13-40T09:00", CHI)).not.toBeNull(); // Date.UTC normalizes; still an instant
    expect(endOfDayInTimeZone("2026-08", CHI)).toBeNull();
  });

  it("computes end-of-day in the zone, not UTC", () => {
    const eod = endOfDayInTimeZone("2026-08-23", CHI)!;
    // 23:59:59 CDT = 04:59:59 UTC next day.
    expect(eod.toISOString()).toBe("2026-08-24T04:59:59.000Z");
  });

  it("bounds the zone's calendar day, including a 25-hour fall-back day", () => {
    // At 2026-08-23 03:00 UTC it is still Aug 22, 10 PM in Chicago.
    const range = dayRangeInTimeZone(CHI, new Date("2026-08-23T03:00:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-08-22T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-23T05:00:00.000Z");

    // The DST fall-back day (Nov 1, 2026) is 25 hours long in Chicago.
    const dst = dayRangeInTimeZone(CHI, new Date("2026-11-01T12:00:00.000Z"));
    expect(dst.end.getTime() - dst.start.getTime()).toBe(25 * 3600 * 1000);
  });

  it("formats in the zone regardless of server locale", () => {
    const instant = zonedTimeToUtc({ year: 2026, month: 8, day: 23, hour: 14, minute: 0 }, CHI);
    expect(formatTimeShort(instant, CHI)).toBe("2:00 PM");
    expect(formatDateTimeShort(instant, CHI)).toContain("Aug 23");
    expect(formatTimeShort(instant, "UTC")).toBe("7:00 PM");
  });
});
