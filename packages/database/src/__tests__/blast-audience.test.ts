import { describe, expect, it } from "vitest";
import { describeAudience, validateBlastAudience, MAX_PICKED_PEOPLE } from "../messaging/audience";

describe("validateBlastAudience", () => {
  it("accepts the four audience kinds", () => {
    expect(validateBlastAudience({ kind: "all" }).ok).toBe(true);
    expect(validateBlastAudience({ kind: "filter", membershipStatus: "MEMBER", campusId: "c1", tag: "youth" }).ok).toBe(true);
    expect(validateBlastAudience({ kind: "group", groupId: "g1" }).ok).toBe(true);
    expect(validateBlastAudience({ kind: "people", personIds: ["p1", "p2"] }).ok).toBe(true);
  });

  it("rejects malformed input, unknown statuses, empty picks, and oversized picks", () => {
    expect(validateBlastAudience(null).ok).toBe(false);
    expect(validateBlastAudience({ kind: "everyone" }).ok).toBe(false);
    expect(validateBlastAudience({ kind: "filter", membershipStatus: "SUPERFAN" }).ok).toBe(false);
    expect(validateBlastAudience({ kind: "group", groupId: " " }).ok).toBe(false);
    expect(validateBlastAudience({ kind: "people", personIds: [] }).ok).toBe(false);
    expect(validateBlastAudience({ kind: "people", personIds: Array.from({ length: MAX_PICKED_PEOPLE + 1 }, (_, i) => `p${i}`) }).ok).toBe(false);
  });

  it("normalizes blank filters to null and dedupes picked people", () => {
    const filter = validateBlastAudience({ kind: "filter", membershipStatus: "", campusId: "  ", tag: null });
    expect(filter.ok && filter.audience).toEqual({
      kind: "filter",
      membershipStatus: null,
      campusId: null,
      tag: null,
      customFieldKey: null,
      customFieldValue: null,
    });
    const people = validateBlastAudience({ kind: "people", personIds: ["p1", "p1", "p2"] });
    expect(people.ok && people.audience).toEqual({ kind: "people", personIds: ["p1", "p2"] });
  });
});

describe("describeAudience", () => {
  it("labels each audience shape", () => {
    expect(describeAudience({ kind: "all" })).toBe("Everyone with an email address");
    expect(
      describeAudience(
        { kind: "filter", membershipStatus: "MEMBER", campusId: "c1", tag: "youth", customFieldKey: null, customFieldValue: null },
        { campusName: "North" },
      ),
    ).toBe("Members at North tagged “youth”");
    expect(validateBlastAudience({ kind: "filter", customFieldKey: "veteran" }).ok).toBe(false);
    const custom = validateBlastAudience({ kind: "filter", customFieldKey: "veteran", customFieldValue: "Yes" });
    expect(custom.ok && custom.audience).toMatchObject({ customFieldKey: "veteran", customFieldValue: "Yes" });
    expect(describeAudience({ kind: "group", groupId: "g" }, { groupName: "Choir" })).toBe("Group: Choir");
    expect(describeAudience({ kind: "people", personIds: ["a"] })).toBe("1 hand-picked person");
  });
});
