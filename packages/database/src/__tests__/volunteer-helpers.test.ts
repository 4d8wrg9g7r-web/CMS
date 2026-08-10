import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type VolunteerAction } from "../authz/volunteer-permissions";
import { isEligible } from "../volunteers/helpers";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

const now = new Date("2026-08-08T12:00:00Z");

describe("isEligible", () => {
  const quals = [
    { name: "child-safety-training", expiresAt: new Date("2027-01-01T00:00:00Z") },
    { name: "orientation", expiresAt: null },
    { name: "cpr", expiresAt: new Date("2026-01-01T00:00:00Z") }, // expired
  ];

  it("is eligible when every requirement is held and unexpired", () => {
    const result = isEligible(["orientation", "child-safety-training"], quals, now);
    expect(result).toEqual({ eligible: true, missing: [], expired: [] });
  });

  it("flags missing and expired requirements separately", () => {
    const result = isEligible(["orientation", "cpr", "background-check-cleared"], quals, now);
    expect(result.eligible).toBe(false);
    expect(result.missing).toEqual(["background-check-cleared"]);
    expect(result.expired).toEqual(["cpr"]);
  });

  it("treats an expiry exactly at now as expired, and no requirements as eligible", () => {
    const boundary = [{ name: "x", expiresAt: now }];
    expect(isEligible(["x"], boundary, now).expired).toEqual(["x"]);
    expect(isEligible([], [], now).eligible).toBe(true);
  });

  it("ignores extra qualifications not required", () => {
    expect(isEligible(["orientation"], quals, now).eligible).toBe(true);
  });
});

describe("volunteer-permissions can()", () => {
  const ALL: VolunteerAction[] = ["volunteer.view", "volunteer.manage"];

  it("grants Owner/Admin and denies every other role and null", () => {
    for (const action of ALL) {
      expect(can("OWNER", action)).toBe(true);
      expect(can("ADMIN", action)).toBe(true);
      for (const role of ["CONTENT_MANAGER", "ANALYTICS_VIEWER"] as OrganizationRole[]) {
        expect(can(role, action), `${role} should be denied ${action}`).toBe(false);
      }
      expect(can(null, action)).toBe(false);
    }
  });
});

describe("tenant guard registration (volunteers)", () => {
  it("registers all four serving models as tenant-scoped", () => {
    for (const model of ["ServingTeam", "ServingPosition", "ServingAssignment", "PersonQualification"]) {
      expect(TENANT_SCOPED_MODELS.has(model), model).toBe(true);
    }
  });
});
