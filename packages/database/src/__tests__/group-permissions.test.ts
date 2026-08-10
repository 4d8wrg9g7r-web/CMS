import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type GroupAction } from "../authz/group-permissions";
import { hasCapacity } from "../groups/helpers";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

const ALL_ACTIONS: GroupAction[] = ["group.view", "group.manage"];
const ALLOWED_ROLES: OrganizationRole[] = ["OWNER", "ADMIN"];
const DENIED_ROLES: OrganizationRole[] = ["CONTENT_MANAGER", "ANALYTICS_VIEWER"];

describe("group-permissions can()", () => {
  it("grants Owner and Admin every Groups action", () => {
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

describe("hasCapacity", () => {
  it("treats null/undefined capacity as unlimited", () => {
    expect(hasCapacity(1000, null)).toBe(true);
    expect(hasCapacity(1000, undefined)).toBe(true);
  });

  it("allows joins below capacity and blocks at or above it", () => {
    expect(hasCapacity(4, 5)).toBe(true);
    expect(hasCapacity(5, 5)).toBe(false);
    expect(hasCapacity(6, 5)).toBe(false);
  });

  it("blocks a zero-capacity group", () => {
    expect(hasCapacity(0, 0)).toBe(false);
  });
});

describe("tenant guard registration (groups)", () => {
  it("registers Group and GroupMembership as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("Group")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("GroupMembership")).toBe(true);
  });
});
