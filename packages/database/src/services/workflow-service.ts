import { Prisma, WorkflowRunStatus, WorkflowStatus } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { computeBackoff } from "../outbox/backoff";
import {
  evaluateConditions,
  parseWorkflowConfig,
  type WorkflowConfig,
  type WorkflowStep,
} from "../workflows/config";

/**
 * Workflow engine service (BLUEPRINT §39). The database package owns orchestration —
 * claiming, step sequencing, durable waits, retries, version pinning, and the run
 * timeline — while the app injects executors for the actual side effects (email, group
 * add, tagging), mirroring outboxService.drain(registry). Staff-facing functions are
 * tenant-scoped via tenantDb; run advancement is a worker path that reads by run id with
 * the run's own organization context (documented background-job exception, BLUEPRINT §32,
 * same as outbox-service).
 */

const MAX_STEP_ATTEMPTS = 3;

// -- Definitions ---------------------------------------------------------------

export interface WorkflowSettingsInput {
  name: string;
  description?: string | null;
  trigger?: string;
  triggerFormId?: string | null;
}

export async function listWorkflows(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return tenantDb.workflowDefinition.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { runs: true } } },
  });
}

export async function getWorkflow(organizationId: string, workflowId: string) {
  return tenantDb.workflowDefinition.findFirst({
    where: { id: workflowId, organizationId },
    include: { _count: { select: { runs: true } } },
  });
}

export async function createWorkflow(organizationId: string, input: WorkflowSettingsInput) {
  return tenantDb.workflowDefinition.create({
    data: {
      organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      trigger: input.trigger ?? "FormSubmitted",
      triggerFormId: input.triggerFormId ?? null,
      draftConfig: { conditions: [], steps: [] },
    },
  });
}

export async function updateWorkflowSettings(
  organizationId: string,
  workflowId: string,
  input: Partial<WorkflowSettingsInput>,
) {
  const data: Prisma.WorkflowDefinitionUncheckedUpdateManyInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.trigger !== undefined) data.trigger = input.trigger;
  if (input.triggerFormId !== undefined) data.triggerFormId = input.triggerFormId;

  const result = await tenantDb.workflowDefinition.updateMany({ where: { id: workflowId, organizationId }, data });
  if (result.count === 0) return null;
  return getWorkflow(organizationId, workflowId);
}

/** Save the working conditions+steps. Normalized through parseWorkflowConfig. */
export async function saveDraftConfig(organizationId: string, workflowId: string, raw: unknown) {
  const config = parseWorkflowConfig(raw);
  const result = await tenantDb.workflowDefinition.updateMany({
    where: { id: workflowId, organizationId },
    data: { draftConfig: config as unknown as Prisma.InputJsonValue },
  });
  if (result.count === 0) return null;
  return config;
}

/**
 * Publish the current draft as a new immutable WorkflowVersion (§39 Versioning). Existing
 * runs keep the version they started with. Refuses an empty step list.
 */
export async function publishWorkflow(organizationId: string, workflowId: string): Promise<number> {
  const workflow = await tenantDb.workflowDefinition.findFirst({ where: { id: workflowId, organizationId } });
  if (!workflow) throw new Error("Workflow not found.");
  const config = parseWorkflowConfig(workflow.draftConfig);
  if (config.steps.length === 0) throw new Error("Add at least one step before publishing.");

  const latest = await tenantDb.workflowVersion.findFirst({
    where: { organizationId, workflowId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  await tenantDb.workflowVersion.create({
    data: { organizationId, workflowId, version: nextVersion, config: config as unknown as Prisma.InputJsonValue },
  });
  await tenantDb.workflowDefinition.updateMany({
    where: { id: workflowId, organizationId },
    data: { status: WorkflowStatus.PUBLISHED, publishedVersion: nextVersion },
  });
  return nextVersion;
}

export async function setWorkflowStatus(organizationId: string, workflowId: string, status: WorkflowStatus) {
  const result = await tenantDb.workflowDefinition.updateMany({
    where: { id: workflowId, organizationId },
    data: { status },
  });
  return result.count > 0;
}

export async function archiveWorkflow(organizationId: string, workflowId: string) {
  const result = await tenantDb.workflowDefinition.updateMany({
    where: { id: workflowId, organizationId },
    data: { archivedAt: new Date(), status: WorkflowStatus.PAUSED },
  });
  return result.count > 0;
}

export async function restoreWorkflow(organizationId: string, workflowId: string) {
  const result = await tenantDb.workflowDefinition.updateMany({
    where: { id: workflowId, organizationId },
    data: { archivedAt: null },
  });
  return result.count > 0;
}

export async function getVersionConfig(
  organizationId: string,
  workflowId: string,
  version: number,
): Promise<WorkflowConfig | null> {
  const row = await tenantDb.workflowVersion.findFirst({ where: { organizationId, workflowId, version } });
  if (!row) return null;
  return parseWorkflowConfig(row.config);
}

// -- Runs ----------------------------------------------------------------------

export async function listRuns(organizationId: string, workflowId: string, opts: { take?: number } = {}) {
  return tenantDb.workflowRun.findMany({
    where: { organizationId, workflowId },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
    include: { person: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
}

export async function getRun(organizationId: string, runId: string) {
  return tenantDb.workflowRun.findFirst({
    where: { id: runId, organizationId },
    include: {
      workflow: { select: { id: true, name: true } },
      person: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
    },
  });
}

/** Cancel a non-terminal run (§39 Cancellation). Guarded so a finished run can't be cancelled. */
export async function cancelRun(organizationId: string, runId: string) {
  const result = await tenantDb.workflowRun.updateMany({
    where: {
      id: runId,
      organizationId,
      status: { in: [WorkflowRunStatus.PENDING, WorkflowRunStatus.WAITING, WorkflowRunStatus.RUNNING] },
    },
    data: { status: WorkflowRunStatus.CANCELLED, completedAt: new Date() },
  });
  return result.count > 0;
}

/** Re-arm a FAILED run for another attempt at its current step. */
export async function retryRun(organizationId: string, runId: string) {
  const result = await tenantDb.workflowRun.updateMany({
    where: { id: runId, organizationId, status: WorkflowRunStatus.FAILED },
    data: { status: WorkflowRunStatus.WAITING, attempts: 0, nextStepAt: new Date(), lastError: null },
  });
  return result.count > 0;
}

// -- Engine (worker paths) -----------------------------------------------------

/** Executes one non-WAIT step. Returns an optional human-readable detail for the timeline. */
export type StepExecutor = (
  step: WorkflowStep,
  run: { runId: string; organizationId: string; personId: string | null; context: unknown },
) => Promise<string | void>;

export type ExecutorMap = Partial<Record<WorkflowStep["type"], StepExecutor>>;

interface LogEntry {
  step: number;
  type: string;
  status: "completed" | "waiting" | "retrying" | "failed" | "cancelled";
  at: string;
  detail?: string;
}

/**
 * Fan a trigger event out to matching published workflows: evaluate each workflow's
 * published conditions against the context, create pinned-version runs, and advance them
 * immediately (durable waits park them for the cron drain). Exactly-once per event is
 * inherited from the outbox's per-handler ProcessedEvent ledger.
 */
export async function processTrigger(
  params: {
    organizationId: string;
    trigger: string;
    formId?: string | null;
    context: unknown;
    eventId?: string;
    personId?: string | null;
  },
  executors: ExecutorMap,
): Promise<{ started: number }> {
  const workflows = await tenantDb.workflowDefinition.findMany({
    where: {
      organizationId: params.organizationId,
      status: WorkflowStatus.PUBLISHED,
      trigger: params.trigger,
      archivedAt: null,
    },
  });

  let started = 0;
  for (const workflow of workflows) {
    if (workflow.publishedVersion == null) continue;
    // FormSubmitted narrowing: a null triggerFormId means any form.
    if (params.trigger === "FormSubmitted" && workflow.triggerFormId && workflow.triggerFormId !== params.formId) {
      continue;
    }
    const config = await getVersionConfig(params.organizationId, workflow.id, workflow.publishedVersion);
    if (!config || !evaluateConditions(config.conditions, params.context)) continue;

    const run = await tenantDb.workflowRun.create({
      data: {
        organizationId: params.organizationId,
        workflowId: workflow.id,
        version: workflow.publishedVersion,
        context: params.context as Prisma.InputJsonValue,
        personId: params.personId ?? null,
        triggeredByEventId: params.eventId ?? null,
      },
    });
    started++;
    await advanceRun(run.id, executors);
  }
  return { started };
}

/**
 * Advance one run as far as it can go: execute steps sequentially, park on WAIT (durable
 * timer), retry the current step with backoff on failure (≤ MAX_STEP_ATTEMPTS, then
 * FAILED), and append every transition to the run's timeline. All state writes are
 * guarded on status=RUNNING so a concurrent cancel wins cleanly.
 */
export async function advanceRun(runId: string, executors: ExecutorMap): Promise<void> {
  // Claim: only a due PENDING/WAITING run may start running; the guard makes concurrent
  // drainers and cancellation race-safe.
  const claimed = await rawDb.workflowRun.updateMany({
    where: {
      id: runId,
      status: { in: [WorkflowRunStatus.PENDING, WorkflowRunStatus.WAITING] },
      nextStepAt: { lte: new Date() },
    },
    data: { status: WorkflowRunStatus.RUNNING },
  });
  if (claimed.count === 0) return;

  const run = await rawDb.workflowRun.findUnique({ where: { id: runId } });
  if (!run) return;

  const config = await getVersionConfig(run.organizationId, run.workflowId, run.version);
  if (!config) {
    await persist(runId, { status: WorkflowRunStatus.FAILED, lastError: "Workflow version not found", completedAt: new Date() });
    return;
  }

  const log: LogEntry[] = Array.isArray(run.log) ? (run.log as unknown as LogEntry[]) : [];
  let stepIndex = run.currentStep;
  let attempts = run.attempts;

  while (true) {
    if (stepIndex >= config.steps.length) {
      log.push({ step: stepIndex, type: "END", status: "completed", at: new Date().toISOString() });
      await persist(runId, {
        status: WorkflowRunStatus.COMPLETED,
        currentStep: stepIndex,
        attempts: 0,
        log: log as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        lastError: null,
      });
      return;
    }

    const step = config.steps[stepIndex]!;

    if (step.type === "WAIT") {
      const resumeAt = new Date(Date.now() + step.minutes * 60_000);
      log.push({
        step: stepIndex,
        type: step.type,
        status: "waiting",
        at: new Date().toISOString(),
        detail: `Waiting ${step.minutes} min (until ${resumeAt.toISOString()})`,
      });
      await persist(runId, {
        status: WorkflowRunStatus.WAITING,
        currentStep: stepIndex + 1,
        attempts: 0,
        nextStepAt: resumeAt,
        log: log as unknown as Prisma.InputJsonValue,
      });
      return;
    }

    const executor = executors[step.type];
    try {
      if (!executor) throw new Error(`No executor registered for step type ${step.type}`);
      const detail = await executor(step, {
        runId: run.id,
        organizationId: run.organizationId,
        personId: run.personId,
        context: run.context,
      });
      log.push({
        step: stepIndex,
        type: step.type,
        status: "completed",
        at: new Date().toISOString(),
        detail: detail || undefined,
      });
      stepIndex++;
      attempts = 0;
      // Persist progress after every completed step so a crash never re-runs it.
      const ok = await persist(runId, {
        currentStep: stepIndex,
        attempts: 0,
        log: log as unknown as Prisma.InputJsonValue,
      });
      if (!ok) return; // cancelled underneath us
    } catch (err) {
      attempts++;
      const message = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_STEP_ATTEMPTS) {
        log.push({ step: stepIndex, type: step.type, status: "failed", at: new Date().toISOString(), detail: message });
        await persist(runId, {
          status: WorkflowRunStatus.FAILED,
          attempts,
          lastError: message.slice(0, 1000),
          log: log as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        });
      } else {
        const delay = computeBackoff(attempts);
        log.push({
          step: stepIndex,
          type: step.type,
          status: "retrying",
          at: new Date().toISOString(),
          detail: `Attempt ${attempts} failed: ${message}`,
        });
        await persist(runId, {
          status: WorkflowRunStatus.WAITING,
          attempts,
          nextStepAt: new Date(Date.now() + delay),
          lastError: message.slice(0, 1000),
          log: log as unknown as Prisma.InputJsonValue,
        });
      }
      return;
    }
  }
}

/** Guarded state write: only applies while the run is still RUNNING (cancel wins races). */
async function persist(runId: string, data: Prisma.WorkflowRunUncheckedUpdateManyInput): Promise<boolean> {
  const result = await rawDb.workflowRun.updateMany({
    where: { id: runId, status: WorkflowRunStatus.RUNNING },
    data,
  });
  return result.count > 0;
}

/** Return runs stuck in RUNNING (crashed worker) to a drainable state. */
export async function reclaimStaleRuns(olderThanMs = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await rawDb.workflowRun.updateMany({
    where: { status: WorkflowRunStatus.RUNNING, updatedAt: { lt: cutoff } },
    data: { status: WorkflowRunStatus.WAITING, nextStepAt: new Date() },
  });
  return result.count;
}

/** Advance every due run (WAIT timers elapsed, retry backoffs due). The cron backstop. */
export async function drainDueRuns(executors: ExecutorMap, limit = 50): Promise<number> {
  await reclaimStaleRuns();
  const due = await rawDb.workflowRun.findMany({
    where: {
      status: { in: [WorkflowRunStatus.PENDING, WorkflowRunStatus.WAITING] },
      nextStepAt: { lte: new Date() },
    },
    orderBy: { nextStepAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const run of due) {
    await advanceRun(run.id, executors);
  }
  return due.length;
}
