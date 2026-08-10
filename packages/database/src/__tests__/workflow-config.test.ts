import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type WorkflowAction } from "../authz/workflow-permissions";
import {
  evaluateConditions,
  getPath,
  interpolate,
  parseWorkflowConfig,
} from "../workflows/config";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

describe("parseWorkflowConfig", () => {
  it("keeps valid conditions and steps, drops malformed ones", () => {
    const config = parseWorkflowConfig({
      conditions: [
        { path: "answers.f_1", op: "equals", value: "Groups" },
        { path: "", op: "equals", value: "x" }, // empty path dropped
        { path: "a", op: "wat", value: "x" }, // bad op dropped
      ],
      steps: [
        { type: "SEND_EMAIL", to: ["a@b.co"], subject: "Hi", body: "Hello {{submitterName}}" },
        { type: "SEND_EMAIL", to: [], subject: "x", body: "y" }, // no recipients dropped
        { type: "ADD_TO_GROUP", groupId: "g1", role: "MEMBER" },
        { type: "ADD_TO_GROUP", groupId: "" }, // dropped
        { type: "ADD_TAG", tag: "first-visit" },
        { type: "WAIT", minutes: 120 },
        { type: "WAIT", minutes: -5 }, // dropped
        { type: "LAUNCH_MISSILES" }, // unknown dropped
      ],
    });
    expect(config.conditions).toHaveLength(1);
    expect(config.steps.map((s) => s.type)).toEqual(["SEND_EMAIL", "ADD_TO_GROUP", "ADD_TAG", "WAIT"]);
  });

  it("caps WAIT at 90 days and returns empty config for garbage", () => {
    const config = parseWorkflowConfig({ steps: [{ type: "WAIT", minutes: 10_000_000 }] });
    expect(config.steps[0]).toEqual({ type: "WAIT", minutes: 60 * 24 * 90 });
    expect(parseWorkflowConfig(null)).toEqual({ conditions: [], steps: [] });
    expect(parseWorkflowConfig("junk")).toEqual({ conditions: [], steps: [] });
  });
});

describe("getPath / evaluateConditions", () => {
  const context = {
    submitterName: "Ada Lovelace",
    submitterEmail: "ada@ex.org",
    answers: { f_interest: "Groups", f_tags: ["usher", "choir"] },
  };

  it("resolves dot-paths and returns undefined for missing ones", () => {
    expect(getPath(context, "answers.f_interest")).toBe("Groups");
    expect(getPath(context, "answers.missing")).toBeUndefined();
    expect(getPath(context, "a.b.c")).toBeUndefined();
  });

  it("equals is case-insensitive; AND semantics across conditions", () => {
    expect(evaluateConditions([{ path: "answers.f_interest", op: "equals", value: "groups" }], context)).toBe(true);
    expect(
      evaluateConditions(
        [
          { path: "answers.f_interest", op: "equals", value: "Groups" },
          { path: "submitterEmail", op: "equals", value: "someone@else.org" },
        ],
        context,
      ),
    ).toBe(false);
  });

  it("contains matches substrings and array membership", () => {
    expect(evaluateConditions([{ path: "submitterName", op: "contains", value: "love" }], context)).toBe(true);
    expect(evaluateConditions([{ path: "answers.f_tags", op: "contains", value: "Choir" }], context)).toBe(true);
    expect(evaluateConditions([{ path: "answers.f_tags", op: "contains", value: "band" }], context)).toBe(false);
  });

  it("not_equals passes on missing paths, fails on a match", () => {
    expect(evaluateConditions([{ path: "answers.missing", op: "not_equals", value: "x" }], context)).toBe(true);
    expect(evaluateConditions([{ path: "answers.f_interest", op: "not_equals", value: "groups" }], context)).toBe(false);
  });

  it("an empty condition list always passes", () => {
    expect(evaluateConditions([], context)).toBe(true);
  });
});

describe("interpolate", () => {
  it("replaces {{path}} placeholders from context", () => {
    expect(interpolate("Hi {{submitterName}}, re: {{answers.f_interest}}", {
      submitterName: "Ada",
      answers: { f_interest: "Groups" },
    })).toBe("Hi Ada, re: Groups");
  });

  it("renders unknown paths as empty string, not the raw placeholder", () => {
    expect(interpolate("Hi {{nope.nothing}}!", {})).toBe("Hi !");
  });
});

describe("workflow-permissions can()", () => {
  const ACTIONS: WorkflowAction[] = ["workflow.view", "workflow.manage"];

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

describe("tenant guard registration (workflows)", () => {
  it("registers WorkflowDefinition, WorkflowVersion, and WorkflowRun as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("WorkflowDefinition")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("WorkflowVersion")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("WorkflowRun")).toBe(true);
  });
});
