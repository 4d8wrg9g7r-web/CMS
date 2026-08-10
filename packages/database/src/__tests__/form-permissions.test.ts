import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type FormAction } from "../authz/form-permissions";

const ALL_ACTIONS: FormAction[] = ["form.view", "form.manage"];
const ALLOWED_ROLES: OrganizationRole[] = ["OWNER", "ADMIN"];
const DENIED_ROLES: OrganizationRole[] = ["CONTENT_MANAGER", "ANALYTICS_VIEWER"];

describe("form-permissions can()", () => {
  it("grants Owner and Admin every Forms action", () => {
    for (const role of ALLOWED_ROLES) {
      for (const action of ALL_ACTIONS) {
        expect(can(role, action), `${role} should be allowed ${action}`).toBe(true);
      }
    }
  });

  it("denies Content Manager, Analytics Viewer, and Prayer Moderator every action", () => {
    for (const role of DENIED_ROLES) {
      for (const action of ALL_ACTIONS) {
        expect(can(role, action), `${role} should be denied ${action}`).toBe(false);
      }
    }
  });

  it("denies a null/undefined role", () => {
    for (const action of ALL_ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });
});
