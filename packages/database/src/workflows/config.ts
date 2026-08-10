/**
 * Pure workflow-config interpreter (BLUEPRINT §39). No Prisma access — unit-tests without
 * a database. Config JSON lives on WorkflowDefinition.draftConfig and is snapshotted
 * immutably into WorkflowVersion.config on publish; this module is its only interpreter,
 * the same pattern as forms/schema.ts.
 */

export const WORKFLOW_TRIGGERS = ["FormSubmitted", "PersonCreated", "EventRegistered"] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

export const CONDITION_OPS = ["equals", "not_equals", "contains"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface WorkflowCondition {
  /** Dot-path into the trigger context, e.g. "submitterEmail" or "answers.f_abc". */
  path: string;
  op: ConditionOp;
  value: string;
}

export type WorkflowStep =
  | { type: "SEND_EMAIL"; to: string[]; subject: string; body: string }
  | { type: "ADD_TO_GROUP"; groupId: string; role?: "LEADER" | "CO_LEADER" | "MEMBER" }
  | { type: "ADD_TAG"; tag: string }
  | {
      type: "CREATE_TASK";
      title: string;
      description?: string;
      assigneeUserId?: string;
      priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
      /** Due this many days after the step runs (omitted = no due date). */
      dueInDays?: number;
    }
  | { type: "ENROLL_IN_JOURNEY"; journeyId: string }
  | { type: "WAIT"; minutes: number };

export type WorkflowStepType = WorkflowStep["type"];
export const WORKFLOW_STEP_TYPES: WorkflowStepType[] = [
  "SEND_EMAIL",
  "ADD_TO_GROUP",
  "ADD_TAG",
  "CREATE_TASK",
  "ENROLL_IN_JOURNEY",
  "WAIT",
];

export interface WorkflowConfig {
  conditions: WorkflowCondition[];
  steps: WorkflowStep[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Parse stored config (unknown JSON) into a clean WorkflowConfig. Tolerant: malformed
 * conditions/steps are dropped rather than thrown, so a corrupt row can never wedge the
 * worker. An unparseable value yields an empty config (which publish refuses).
 */
export function parseWorkflowConfig(raw: unknown): WorkflowConfig {
  const empty: WorkflowConfig = { conditions: [], steps: [] };
  if (!isRecord(raw)) return empty;

  const conditions: WorkflowCondition[] = [];
  if (Array.isArray(raw.conditions)) {
    for (const c of raw.conditions) {
      if (!isRecord(c)) continue;
      if (typeof c.path !== "string" || !c.path.trim()) continue;
      if (!CONDITION_OPS.includes(c.op as ConditionOp)) continue;
      conditions.push({ path: c.path.trim(), op: c.op as ConditionOp, value: String(c.value ?? "") });
    }
  }

  const steps: WorkflowStep[] = [];
  if (Array.isArray(raw.steps)) {
    for (const s of raw.steps) {
      if (!isRecord(s)) continue;
      switch (s.type) {
        case "SEND_EMAIL": {
          const to = Array.isArray(s.to) ? s.to.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : [];
          if (to.length === 0 || typeof s.subject !== "string" || typeof s.body !== "string") continue;
          steps.push({ type: "SEND_EMAIL", to, subject: s.subject, body: s.body });
          break;
        }
        case "ADD_TO_GROUP": {
          if (typeof s.groupId !== "string" || !s.groupId.trim()) continue;
          const role = s.role === "LEADER" || s.role === "CO_LEADER" || s.role === "MEMBER" ? s.role : undefined;
          steps.push({ type: "ADD_TO_GROUP", groupId: s.groupId, role });
          break;
        }
        case "ADD_TAG": {
          if (typeof s.tag !== "string" || !s.tag.trim()) continue;
          steps.push({ type: "ADD_TAG", tag: s.tag.trim() });
          break;
        }
        case "CREATE_TASK": {
          if (typeof s.title !== "string" || !s.title.trim()) continue;
          const priority =
            s.priority === "LOW" || s.priority === "NORMAL" || s.priority === "HIGH" || s.priority === "URGENT"
              ? s.priority
              : undefined;
          const dueInDays = Number(s.dueInDays);
          steps.push({
            type: "CREATE_TASK",
            title: s.title,
            description: typeof s.description === "string" && s.description.trim() ? s.description : undefined,
            assigneeUserId:
              typeof s.assigneeUserId === "string" && s.assigneeUserId.trim() ? s.assigneeUserId : undefined,
            priority,
            dueInDays: Number.isFinite(dueInDays) && dueInDays > 0 ? Math.min(dueInDays, 365) : undefined,
          });
          break;
        }
        case "ENROLL_IN_JOURNEY": {
          if (typeof s.journeyId !== "string" || !s.journeyId.trim()) continue;
          steps.push({ type: "ENROLL_IN_JOURNEY", journeyId: s.journeyId });
          break;
        }
        case "WAIT": {
          const minutes = Number(s.minutes);
          if (!Number.isFinite(minutes) || minutes <= 0) continue;
          steps.push({ type: "WAIT", minutes: Math.min(minutes, 60 * 24 * 90) }); // cap at 90 days
          break;
        }
        default:
          continue;
      }
    }
  }

  return { conditions, steps };
}

/** Resolve a dot-path ("answers.f_abc") in a nested context. Returns undefined if absent. */
export function getPath(context: unknown, path: string): unknown {
  let current: unknown = context;
  for (const key of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Evaluate conditions over the trigger context — AND semantics, deterministic (§39
 * Condition/Branch). String comparison is case-insensitive; `contains` matches substrings
 * and array membership. A missing path fails equals/contains and passes not_equals.
 */
export function evaluateConditions(conditions: WorkflowCondition[], context: unknown): boolean {
  for (const condition of conditions) {
    const actual = getPath(context, condition.path);
    const expected = condition.value.toLowerCase();

    let matched: boolean;
    if (Array.isArray(actual)) {
      matched = actual.some((v) => String(v).toLowerCase() === expected);
    } else if (actual === undefined || actual === null) {
      matched = false;
    } else {
      const actualStr = String(actual).toLowerCase();
      matched = condition.op === "contains" ? actualStr.includes(expected) : actualStr === expected;
    }

    if (condition.op === "not_equals" ? matched : !matched) return false;
  }
  return true;
}

/**
 * Replace {{path}} placeholders with values from the context ("Hi {{submitterName}}").
 * Unknown paths render as an empty string rather than leaking the placeholder.
 */
export function interpolate(template: string, context: unknown): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = getPath(context, path);
    return value === undefined || value === null ? "" : String(value);
  });
}
