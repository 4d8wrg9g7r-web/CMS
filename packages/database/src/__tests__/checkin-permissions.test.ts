import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type CheckinAction } from "../authz/checkin-permissions";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

const ROSTER_ACTIONS: CheckinAction[] = ["checkin.view", "checkin.manage"];

describe("checkin-permissions can()", () => {
  it("grants Owner/Admin roster actions and denies every other role and null", () => {
    for (const action of ROSTER_ACTIONS) {
      expect(can("OWNER", action)).toBe(true);
      expect(can("ADMIN", action)).toBe(true);
      for (const role of ["CONTENT_MANAGER", "ANALYTICS_VIEWER"] as OrganizationRole[]) {
        expect(can(role, action), `${role} should be denied ${action}`).toBe(false);
      }
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });

  // The aggregates/roster boundary (docs/domain/attendance.md): ANALYTICS_VIEWER may
  // see attendance aggregates but never rosters; CONTENT_MANAGER sees neither.
  it("grants attendance.view to Owner/Admin/Analytics Viewer only", () => {
    expect(can("OWNER", "attendance.view")).toBe(true);
    expect(can("ADMIN", "attendance.view")).toBe(true);
    expect(can("ANALYTICS_VIEWER", "attendance.view")).toBe(true);
    expect(can("CONTENT_MANAGER", "attendance.view")).toBe(false);
    expect(can(null, "attendance.view")).toBe(false);
  });

  it("keeps rosters denied to Analytics Viewer even with attendance.view granted", () => {
    expect(can("ANALYTICS_VIEWER", "checkin.view")).toBe(false);
    expect(can("ANALYTICS_VIEWER", "checkin.manage")).toBe(false);
  });
});

describe("tenant guard registration (check-in)", () => {
  it("registers CheckIn as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("CheckIn")).toBe(true);
  });
});
