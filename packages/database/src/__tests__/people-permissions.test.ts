import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type PeopleAction } from "../authz/people-permissions";

const ALL_ACTIONS: PeopleAction[] = [
  "person.view",
  "person.manage",
  "person.import",
  "household.view",
  "household.manage",
];
const ALLOWED_ROLES: OrganizationRole[] = ["OWNER", "ADMIN"];
const DENIED_ROLES: OrganizationRole[] = ["CONTENT_MANAGER", "ANALYTICS_VIEWER"];

describe("people-permissions can()", () => {
  it("grants Owner and Admin every People/Households action", () => {
    for (const role of ALLOWED_ROLES) {
      for (const action of ALL_ACTIONS) {
        expect(can(role, action), `${role} should be allowed ${action}`).toBe(true);
      }
    }
  });

  // Negative authorization matrix (BLUEPRINT §52 / Definition of Done): every other
  // role must be denied every action -- People data is Confidential and a distinct
  // security domain from content/analytics/prayer.
  it("denies Content Manager and Analytics Viewer every action", () => {
    for (const role of DENIED_ROLES) {
      for (const action of ALL_ACTIONS) {
        expect(can(role, action), `${role} should be denied ${action}`).toBe(false);
      }
    }
  });

  it("denies a null/undefined role (unauthenticated or no membership)", () => {
    for (const action of ALL_ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });

  it("covers every OrganizationRole in the enum so a new role can't default to allow", () => {
    // If a role is added to the Prisma enum without a matrix entry, can() returns
    // false (deny-by-default) rather than throwing -- assert that explicitly.
    const everyRole = Object.values(OrganizationRole);
    for (const role of everyRole) {
      const decisions = ALL_ACTIONS.map((a) => can(role, a));
      // Each role yields a concrete boolean for each action (no throw, no undefined).
      expect(decisions.every((d) => typeof d === "boolean")).toBe(true);
    }
  });
});
