import { EventRecurrence, OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type EventAction } from "../authz/event-permissions";
import { expandOccurrences, nextOccurrence } from "../events/helpers";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

const d = (iso: string) => new Date(iso);

describe("expandOccurrences", () => {
  it("yields a NONE event only when its start falls in the window", () => {
    const event = { startAt: d("2026-09-06T10:00:00Z"), recurrence: EventRecurrence.NONE, recurrenceInterval: 1 };
    expect(expandOccurrences(event, d("2026-09-01T00:00:00Z"), d("2026-09-30T00:00:00Z"))).toEqual([
      d("2026-09-06T10:00:00Z"),
    ]);
    expect(expandOccurrences(event, d("2026-10-01T00:00:00Z"), d("2026-10-31T00:00:00Z"))).toEqual([]);
  });

  it("expands WEEKLY with an interval and clips to the window", () => {
    const event = { startAt: d("2026-09-06T10:00:00Z"), recurrence: EventRecurrence.WEEKLY, recurrenceInterval: 2 };
    const occurrences = expandOccurrences(event, d("2026-09-15T00:00:00Z"), d("2026-10-20T00:00:00Z"));
    expect(occurrences).toEqual([d("2026-09-20T10:00:00Z"), d("2026-10-04T10:00:00Z"), d("2026-10-18T10:00:00Z")]);
  });

  it("expands DAILY and respects the until bound inclusively", () => {
    const event = {
      startAt: d("2026-09-01T08:00:00Z"),
      recurrence: EventRecurrence.DAILY,
      recurrenceInterval: 1,
      recurrenceUntil: d("2026-09-03T08:00:00Z"),
    };
    const occurrences = expandOccurrences(event, d("2026-09-01T00:00:00Z"), d("2026-09-30T00:00:00Z"));
    expect(occurrences).toHaveLength(3);
    expect(occurrences[2]).toEqual(d("2026-09-03T08:00:00Z"));
  });

  it("MONTHLY skips months lacking the start day rather than shifting", () => {
    const event = { startAt: d("2026-01-31T09:00:00Z"), recurrence: EventRecurrence.MONTHLY, recurrenceInterval: 1 };
    const occurrences = expandOccurrences(event, d("2026-01-01T00:00:00Z"), d("2026-05-31T23:59:59Z"));
    // Jan 31, (Feb skipped), Mar 31, (Apr skipped), May 31.
    expect(occurrences).toEqual([d("2026-01-31T09:00:00Z"), d("2026-03-31T09:00:00Z"), d("2026-05-31T09:00:00Z")]);
  });

  it("caps output at the limit and returns [] for an inverted window", () => {
    const event = { startAt: d("2026-09-01T08:00:00Z"), recurrence: EventRecurrence.DAILY, recurrenceInterval: 1 };
    expect(expandOccurrences(event, d("2026-09-01T00:00:00Z"), d("2027-09-01T00:00:00Z"), 5)).toHaveLength(5);
    expect(expandOccurrences(event, d("2026-09-30T00:00:00Z"), d("2026-09-01T00:00:00Z"))).toEqual([]);
  });
});

describe("nextOccurrence", () => {
  it("finds the next occurrence after a given time, or null past the series end", () => {
    const event = {
      startAt: d("2026-09-06T10:00:00Z"),
      recurrence: EventRecurrence.WEEKLY,
      recurrenceInterval: 1,
      recurrenceUntil: d("2026-09-20T10:00:00Z"),
    };
    expect(nextOccurrence(event, d("2026-09-10T00:00:00Z"))).toEqual(d("2026-09-13T10:00:00Z"));
    expect(nextOccurrence(event, d("2026-09-21T00:00:00Z"))).toBeNull();
  });
});

describe("event-permissions can()", () => {
  it("lets Content Managers manage events but not view registrations", () => {
    expect(can("CONTENT_MANAGER", "event.view")).toBe(true);
    expect(can("CONTENT_MANAGER", "event.manage")).toBe(true);
    expect(can("CONTENT_MANAGER", "event.registrations.view")).toBe(false);
  });

  it("grants Owner/Admin everything and denies the rest", () => {
    const ALL: EventAction[] = ["event.view", "event.manage", "event.registrations.view"];
    for (const action of ALL) {
      expect(can("OWNER", action)).toBe(true);
      expect(can("ADMIN", action)).toBe(true);
      for (const role of ["ANALYTICS_VIEWER"] as OrganizationRole[]) {
        expect(can(role, action), `${role} should be denied ${action}`).toBe(false);
      }
      expect(can(null, action)).toBe(false);
    }
  });
});

describe("tenant guard registration (events)", () => {
  it("registers Event and EventRegistration as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("Event")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("EventRegistration")).toBe(true);
  });
});
