"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Filter, Plus, Trash2, Zap } from "lucide-react";
import type { WorkflowCondition, WorkflowConfig } from "@cms/database";
import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import { CONDITION_OP_OPTIONS, STEP_TYPE_OPTIONS } from "../lib/workflows-format";

/**
 * Editor for a workflow's draft config (conditions + ordered steps). Same shape as
 * FormBuilder: local state serialized to a hidden JSON input, one "save draft" server
 * action; publish (a separate action) snapshots the saved draft into an immutable
 * version. The step forms are intentionally plain — a visual DAG editor is an explicit
 * v1 non-goal (docs/domain/workflows.md).
 */

interface EditableStep {
  key: string;
  type: string;
  to: string; // SEND_EMAIL (comma-separated)
  subject: string;
  body: string;
  groupId: string; // ADD_TO_GROUP
  role: string;
  tag: string; // ADD_TAG
  minutes: string; // WAIT
  taskTitle: string; // CREATE_TASK
  taskDescription: string;
  taskPriority: string;
  taskDueInDays: string;
  taskAssigneeUserId: string;
  journeyId: string; // ENROLL_IN_JOURNEY
}

function newStep(): EditableStep {
  return {
    key: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}`,
    type: "SEND_EMAIL",
    to: "",
    subject: "",
    body: "",
    groupId: "",
    role: "MEMBER",
    tag: "",
    minutes: "60",
    taskTitle: "",
    taskDescription: "",
    taskPriority: "NORMAL",
    taskDueInDays: "",
    taskAssigneeUserId: "",
    journeyId: "",
  };
}

function toEditable(config: WorkflowConfig): { conditions: WorkflowCondition[]; steps: EditableStep[] } {
  return {
    conditions: config.conditions,
    steps: config.steps.map((s, i) => ({
      key: `loaded_${i}`,
      type: s.type,
      to: s.type === "SEND_EMAIL" ? s.to.join(", ") : "",
      subject: s.type === "SEND_EMAIL" ? s.subject : "",
      body: s.type === "SEND_EMAIL" ? s.body : "",
      groupId: s.type === "ADD_TO_GROUP" ? s.groupId : "",
      role: s.type === "ADD_TO_GROUP" ? (s.role ?? "MEMBER") : "MEMBER",
      tag: s.type === "ADD_TAG" ? s.tag : "",
      minutes: s.type === "WAIT" ? String(s.minutes) : "60",
      taskTitle: s.type === "CREATE_TASK" ? s.title : "",
      taskDescription: s.type === "CREATE_TASK" ? (s.description ?? "") : "",
      taskPriority: s.type === "CREATE_TASK" ? (s.priority ?? "NORMAL") : "NORMAL",
      taskDueInDays: s.type === "CREATE_TASK" && s.dueInDays ? String(s.dueInDays) : "",
      taskAssigneeUserId: s.type === "CREATE_TASK" ? (s.assigneeUserId ?? "") : "",
      journeyId: s.type === "ENROLL_IN_JOURNEY" ? s.journeyId : "",
    })),
  };
}

export function WorkflowBuilder({
  action,
  initialConfig,
  groups,
  members,
  journeys,
  contextHint,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initialConfig: WorkflowConfig;
  groups: { id: string; name: string }[];
  members: { userId: string; label: string }[];
  journeys: { id: string; name: string }[];
  contextHint: string;
}) {
  const initial = toEditable(initialConfig);
  const [conditions, setConditions] = useState<WorkflowCondition[]>(initial.conditions);
  const [steps, setSteps] = useState<EditableStep[]>(initial.steps);

  function updateCondition(index: number, patch: Partial<WorkflowCondition>) {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function updateStep(index: number, patch: Partial<EditableStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function moveStep(index: number, delta: number) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  const serialized = JSON.stringify({
    conditions: conditions.filter((c) => c.path.trim()),
    steps: steps.map((s) => {
      switch (s.type) {
        case "SEND_EMAIL":
          return {
            type: "SEND_EMAIL",
            to: s.to.split(",").map((t) => t.trim()).filter(Boolean),
            subject: s.subject,
            body: s.body,
          };
        case "ADD_TO_GROUP":
          return { type: "ADD_TO_GROUP", groupId: s.groupId, role: s.role };
        case "ADD_TAG":
          return { type: "ADD_TAG", tag: s.tag };
        case "CREATE_TASK":
          return {
            type: "CREATE_TASK",
            title: s.taskTitle,
            description: s.taskDescription || undefined,
            priority: s.taskPriority,
            dueInDays: s.taskDueInDays ? Number(s.taskDueInDays) : undefined,
            assigneeUserId: s.taskAssigneeUserId || undefined,
          };
        case "ENROLL_IN_JOURNEY":
          return { type: "ENROLL_IN_JOURNEY", journeyId: s.journeyId };
        case "WAIT":
        default:
          return { type: "WAIT", minutes: Number(s.minutes) };
      }
    }),
  });

  return (
    <form action={action}>
      <input type="hidden" name="config" value={serialized} />

      {/* Conditions */}
      <div className="mb-6">
        <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <Filter size={13} /> Only run when… <span className="font-normal normal-case">(all must match; empty = always)</span>
        </h3>
        <p className="mb-2 text-xs text-ink-muted">{contextHint}</p>
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                value={condition.path}
                onChange={(e) => updateCondition(index, { path: e.target.value })}
                placeholder="answers.field_id"
                className="w-52 text-sm"
              />
              <Select
                value={condition.op}
                onChange={(e) => updateCondition(index, { op: e.target.value as WorkflowCondition["op"] })}
                className="w-40 text-sm"
              >
                {CONDITION_OP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Input
                value={condition.value}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
                placeholder="value"
                className="w-44 text-sm"
              />
              <button
                type="button"
                onClick={() => setConditions((prev) => prev.filter((_, i) => i !== index))}
                aria-label="Remove condition"
                className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setConditions((prev) => [...prev, { path: "", op: "equals", value: "" }])}
          className={buttonClasses("ghost", "sm") + " mt-2"}
        >
          <Plus size={14} /> Add condition
        </button>
      </div>

      {/* Steps */}
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <Zap size={13} /> Then do, in order
      </h3>
      <div className="space-y-3">
        {steps.length === 0 && (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-ink-muted">
            No steps yet. Add the first action below.
          </p>
        )}
        {steps.map((step, index) => (
          <div key={step.key} className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-5 text-center text-xs font-semibold text-ink-muted">{index + 1}</span>
              <div className="grid flex-1 gap-3">
                <Select
                  value={step.type}
                  onChange={(e) => updateStep(index, { type: e.target.value })}
                  className="w-56 text-sm"
                >
                  {STEP_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>

                {step.type === "SEND_EMAIL" && (
                  <div className="grid gap-2">
                    <Input
                      value={step.to}
                      onChange={(e) => updateStep(index, { to: e.target.value })}
                      placeholder="To (comma-separated emails)"
                      className="text-sm"
                    />
                    <Input
                      value={step.subject}
                      onChange={(e) => updateStep(index, { subject: e.target.value })}
                      placeholder="Subject — supports {{submitterName}} etc."
                      className="text-sm"
                    />
                    <Textarea
                      value={step.body}
                      onChange={(e) => updateStep(index, { body: e.target.value })}
                      rows={3}
                      placeholder="Body — supports {{placeholders}} from the trigger context"
                      className="text-sm"
                    />
                  </div>
                )}

                {step.type === "ADD_TO_GROUP" && (
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={step.groupId}
                      onChange={(e) => updateStep(index, { groupId: e.target.value })}
                      className="w-64 text-sm"
                    >
                      <option value="">Choose a group…</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={step.role}
                      onChange={(e) => updateStep(index, { role: e.target.value })}
                      className="w-36 text-sm"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="CO_LEADER">Co-leader</option>
                      <option value="LEADER">Leader</option>
                    </Select>
                  </div>
                )}

                {step.type === "ADD_TAG" && (
                  <Input
                    value={step.tag}
                    onChange={(e) => updateStep(index, { tag: e.target.value })}
                    placeholder="Tag, e.g. first-visit"
                    className="w-64 text-sm"
                  />
                )}

                {step.type === "CREATE_TASK" && (
                  <div className="grid gap-2">
                    <Input
                      value={step.taskTitle}
                      onChange={(e) => updateStep(index, { taskTitle: e.target.value })}
                      placeholder="Task title — supports {{submitterName}} etc."
                      className="text-sm"
                    />
                    <Textarea
                      value={step.taskDescription}
                      onChange={(e) => updateStep(index, { taskDescription: e.target.value })}
                      rows={2}
                      placeholder="Details (optional, supports {{placeholders}})"
                      className="text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={step.taskPriority}
                        onChange={(e) => updateStep(index, { taskPriority: e.target.value })}
                        className="w-32 text-sm"
                      >
                        <option value="LOW">Low</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </Select>
                      <Select
                        value={step.taskAssigneeUserId}
                        onChange={(e) => updateStep(index, { taskAssigneeUserId: e.target.value })}
                        className="w-52 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.label}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
                        Due in
                        <Input
                          type="number"
                          min={1}
                          value={step.taskDueInDays}
                          onChange={(e) => updateStep(index, { taskDueInDays: e.target.value })}
                          className="w-20 text-sm"
                        />
                        days
                      </label>
                    </div>
                  </div>
                )}

                {step.type === "ENROLL_IN_JOURNEY" && (
                  <Select
                    value={step.journeyId}
                    onChange={(e) => updateStep(index, { journeyId: e.target.value })}
                    className="w-64 text-sm"
                  >
                    <option value="">Choose a journey…</option>
                    {journeys.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </Select>
                )}

                {step.type === "WAIT" && (
                  <label className="flex items-center gap-2 text-sm text-ink-secondary">
                    Wait
                    <Input
                      type="number"
                      min={1}
                      value={step.minutes}
                      onChange={(e) => updateStep(index, { minutes: e.target.value })}
                      className="w-28 text-sm"
                    />
                    minutes before the next step
                  </label>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => moveStep(index, -1)} aria-label="Move up" className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => moveStep(index, 1)} aria-label="Move down" className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="Remove step"
                  className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={() => setSteps((prev) => [...prev, newStep()])} className={buttonClasses("secondary", "sm")}>
          <Plus size={15} /> Add step
        </button>
        <button type="submit" className={buttonClasses("primary", "md")}>
          Save workflow
        </button>
      </div>
    </form>
  );
}
