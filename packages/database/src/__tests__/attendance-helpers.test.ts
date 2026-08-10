import { describe, expect, it } from "vitest";
import {
  countUniquePeople,
  summarizeByEvent,
  weeklyBuckets,
  weekStart,
  type AttendanceRow,
} from "../checkins/helpers";

function row(occurrenceAt: string, eventId = "e1", personId: string | null = "p1"): AttendanceRow {
  return { occurrenceAt: new Date(occurrenceAt), eventId, personId };
}

describe("weekStart", () => {
  it("returns the same UTC midnight for a Sunday", () => {
    // 2026-08-09 is a Sunday.
    expect(weekStart(new Date("2026-08-09T15:30:00Z")).toISOString()).toBe("2026-08-09T00:00:00.000Z");
  });

  it("rolls back to the previous Sunday for mid-week instants", () => {
    // 2026-08-12 is a Wednesday.
    expect(weekStart(new Date("2026-08-12T03:00:00Z")).toISOString()).toBe("2026-08-09T00:00:00.000Z");
  });

  it("handles Saturday (the last day of the week)", () => {
    // 2026-08-15 is a Saturday — still the Aug 9 week.
    expect(weekStart(new Date("2026-08-15T23:59:59Z")).toISOString()).toBe("2026-08-09T00:00:00.000Z");
  });
});

describe("weeklyBuckets", () => {
  const now = new Date("2026-08-12T12:00:00Z"); // Wednesday in the Aug 9 week

  it("returns exactly N buckets oldest-first, padding empty weeks with zero", () => {
    const rows = [row("2026-08-09T10:00:00Z"), row("2026-08-09T11:00:00Z"), row("2026-07-26T10:00:00Z")];
    const buckets = weeklyBuckets(rows, 4, now);
    expect(buckets.map((b) => b.weekStart.toISOString().slice(0, 10))).toEqual([
      "2026-07-19",
      "2026-07-26",
      "2026-08-02",
      "2026-08-09",
    ]);
    expect(buckets.map((b) => b.count)).toEqual([0, 1, 0, 2]);
  });

  it("ignores rows outside the window on both sides", () => {
    const rows = [row("2026-06-01T10:00:00Z"), row("2026-09-01T10:00:00Z"), row("2026-08-10T10:00:00Z")];
    const buckets = weeklyBuckets(rows, 2, now);
    expect(buckets.map((b) => b.count)).toEqual([0, 1]);
  });

  it("returns all-zero buckets for no rows", () => {
    expect(weeklyBuckets([], 3, now).every((b) => b.count === 0)).toBe(true);
  });
});

describe("summarizeByEvent", () => {
  it("computes totals, distinct occurrences, averages, and the latest occurrence", () => {
    const rows = [
      row("2026-08-02T10:00:00Z", "sunday"),
      row("2026-08-02T10:00:00Z", "sunday", "p2"),
      row("2026-08-02T10:00:00Z", "sunday", "p3"),
      row("2026-08-09T10:00:00Z", "sunday"),
      row("2026-08-05T19:00:00Z", "midweek"),
    ];
    const summaries = summarizeByEvent(rows);
    expect(summaries).toHaveLength(2);
    // Sorted by total descending.
    expect(summaries[0]!).toMatchObject({
      eventId: "sunday",
      total: 4,
      occurrenceCount: 2,
      averagePerOccurrence: 2,
      lastOccurrenceCount: 1,
    });
    expect(summaries[0]!.lastOccurrenceAt.toISOString()).toBe("2026-08-09T10:00:00.000Z");
    expect(summaries[1]!).toMatchObject({ eventId: "midweek", total: 1, occurrenceCount: 1 });
  });

  it("rounds averages to one decimal", () => {
    const rows = [
      row("2026-08-02T10:00:00Z", "e"),
      row("2026-08-02T10:00:00Z", "e", "p2"),
      row("2026-08-09T10:00:00Z", "e"),
      row("2026-08-16T10:00:00Z", "e"),
    ];
    expect(summarizeByEvent(rows)[0]!.averagePerOccurrence).toBe(1.3);
  });

  it("returns an empty list for no rows", () => {
    expect(summarizeByEvent([])).toEqual([]);
  });
});

describe("countUniquePeople", () => {
  it("counts distinct personIds and never counts guest rows (null personId)", () => {
    const rows = [
      row("2026-08-02T10:00:00Z", "e1", "p1"),
      row("2026-08-09T10:00:00Z", "e1", "p1"),
      row("2026-08-09T10:00:00Z", "e1", "p2"),
      row("2026-08-09T10:00:00Z", "e1", null),
      row("2026-08-09T10:00:00Z", "e1", null),
    ];
    expect(countUniquePeople(rows)).toBe(2);
  });
});
