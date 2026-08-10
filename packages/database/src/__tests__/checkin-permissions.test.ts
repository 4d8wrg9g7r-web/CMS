import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type CheckinAction } from "../authz/checkin-permissions";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

const ALL_ACTIONS: CheckinAction[] = ["checkin.view", "checkin.manage"];

describe("checkin-permissions can()", () => {
  it("grants Owner/Admin and denies every other role and null", () => {
    for (const action of ALL_ACTIONS) {
      expect(can("OWNER", action)).toBe(true);
      expect(can("ADMIN", action)).toBe(true);
      for (const role of ["CONTENT_MANAGER", "ANALYTICS_VIEWER"] as OrganizationRole[]) {
        expect(can(role, action), `${role} should be denied ${action}`).toBe(false);
      }
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });
});

describe("tenant guard registration (check-in)", () => {
  it("registers CheckIn as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("CheckIn")).toBe(true);
  });
});
