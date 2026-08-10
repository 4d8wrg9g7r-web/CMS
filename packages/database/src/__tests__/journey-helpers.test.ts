import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type JourneyAction } from "../authz/journey-permissions";
import { journeyProgress } from "../journeys/helpers";
import { parseWorkflowConfig } from "../workflows/config";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

const MILESTONES = [
  { id: "m1", name: "First Visit", order: 0 },
  { id: "m3", name: "Serve Team", order: 2 },
  { id: "m2", name: "Membership", order: 1 },
];

describe("journeyProgress", () => {
  it("computes percent and the next milestone in order", () => {
    const p = journeyProgress(MILESTONES, ["m1"]);
    expect(p.totalMilestones).toBe(3);
    expect(p.completedMilestones).toBe(1);
    expect(p.percent).toBe(33);
    expect(p.nextMilestone).toEqual({ id: "m2", name: "Membership" });
    expect(p.isComplete).toBe(false);
  });

  it("respects order, not insertion order, for the next milestone", () => {
    const p = journeyProgress(MILESTONES, []);
    expect(p.nextMilestone?.id).toBe("m1");
  });

  it("detects completion and ignores completions for removed milestones", () => {
    const done = journeyProgress(MILESTONES, ["m1", "m2", "m3", "ghost_removed"]);
    expect(done.isComplete).toBe(true);
    expect(done.percent).toBe(100);
    expect(done.nextMilestone).toBeNull();
  });

  it("treats an empty journey as 0% and never complete", () => {
    const p = journeyProgress([], ["anything"]);
    expect(p.percent).toBe(0);
    expect(p.isComplete).toBe(false);
    expect(p.nextMilestone).toBeNull();
  });
});

describe("ENROLL_IN_JOURNEY workflow step parsing", () => {
  it("keeps a valid step and drops one without a journeyId", () => {
    const config = parseWorkflowConfig({
      steps: [
        { type: "ENROLL_IN_JOURNEY", journeyId: "j1" },
        { type: "ENROLL_IN_JOURNEY", journeyId: "" },
        { type: "ENROLL_IN_JOURNEY" },
      ],
    });
    expect(config.steps).toEqual([{ type: "ENROLL_IN_JOURNEY", journeyId: "j1" }]);
  });
});

describe("journey-permissions can()", () => {
  const ACTIONS: JourneyAction[] = ["journey.view", "journey.manage"];

  it("grants Owner/Admin and denies every other role and null", () => {
    for (const action of ACTIONS) {
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

describe("tenant guard registration (journeys)", () => {
  it("registers all four journey models as tenant-scoped", () => {
    for (const model of ["JourneyDefinition", "JourneyMilestone", "JourneyEnrollment", "JourneyMilestoneCompletion"]) {
      expect(TENANT_SCOPED_MODELS.has(model), model).toBe(true);
    }
  });
});
