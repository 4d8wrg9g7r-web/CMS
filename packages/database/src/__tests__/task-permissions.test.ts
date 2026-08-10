import { OrganizationRole, TaskStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type TaskAction } from "../authz/task-permissions";
import { isOverdue } from "../tasks/helpers";
import { parseWorkflowConfig } from "../workflows/config";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

const ALL_ACTIONS: TaskAction[] = ["task.view", "task.manage"];

describe("task-permissions can()", () => {
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

describe("isOverdue", () => {
  const now = new Date("2026-08-07T12:00:00Z");

  it("is overdue only when live and past due", () => {
    const past = new Date("2026-08-06T12:00:00Z");
    const future = new Date("2026-08-08T12:00:00Z");
    expect(isOverdue({ status: TaskStatus.OPEN, dueAt: past }, now)).toBe(true);
    expect(isOverdue({ status: TaskStatus.IN_PROGRESS, dueAt: past }, now)).toBe(true);
    expect(isOverdue({ status: TaskStatus.OPEN, dueAt: future }, now)).toBe(false);
  });

  it("is never overdue when closed or undated", () => {
    const past = new Date("2026-08-06T12:00:00Z");
    expect(isOverdue({ status: TaskStatus.COMPLETED, dueAt: past }, now)).toBe(false);
    expect(isOverdue({ status: TaskStatus.CANCELLED, dueAt: past }, now)).toBe(false);
    expect(isOverdue({ status: TaskStatus.OPEN, dueAt: null }, now)).toBe(false);
  });
});

describe("CREATE_TASK workflow step parsing", () => {
  it("keeps a valid CREATE_TASK step and normalizes optional fields", () => {
    const config = parseWorkflowConfig({
      steps: [
        { type: "CREATE_TASK", title: "Follow up with {{submitterName}}", priority: "HIGH", dueInDays: 2 },
        { type: "CREATE_TASK", title: "" }, // empty title dropped
        { type: "CREATE_TASK", title: "Capped", dueInDays: 10_000 }, // capped at 365
        { type: "CREATE_TASK", title: "Loose", priority: "WHENEVER", dueInDays: -1 }, // bad fields cleared
      ],
    });
    expect(config.steps).toHaveLength(3);
    expect(config.steps[0]).toEqual({
      type: "CREATE_TASK",
      title: "Follow up with {{submitterName}}",
      description: undefined,
      assigneeUserId: undefined,
      priority: "HIGH",
      dueInDays: 2,
    });
    expect(config.steps[1]).toMatchObject({ title: "Capped", dueInDays: 365 });
    expect(config.steps[2]).toMatchObject({ title: "Loose", priority: undefined, dueInDays: undefined });
  });
});

describe("tenant guard registration (tasks)", () => {
  it("registers Task as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("Task")).toBe(true);
  });
});
