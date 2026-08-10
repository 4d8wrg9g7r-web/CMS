# Workflow Engine

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** B (integrity-sensitive infrastructure)

Implements the first working slice of [BLUEPRINT §39 (Workflow engine specification)](../architecture/BLUEPRINT.md#39-workflow-engine-specification)
— "the connective tissue of the entire platform" (§27). Runs on the transactional outbox
([docs/domain/outbox.md](./outbox.md)): domain events trigger runs, and runs advance
durably with retries, waits, and an inspectable timeline. This is the shared engine other
modules compose instead of inventing their own automation (non-negotiable principle #6).

The v1 flagship use case: *Connect Card submitted → if they expressed interest in Groups →
add them to a group → notify staff → wait 2 days → send a follow-up email.*

## Problem
Churches automate follow-up by hand today. Staff need trigger → condition → action
automations built on existing primitives, and every run must be explainable: what
triggered it, what ran, what failed, what's next (§27 "every workflow run must be
inspectable").

## Actors
- **Owner / Admin** — build, publish, pause, inspect runs, cancel/retry. Automation can
  email people and mutate records, so it's firmly admin territory.
- **Other roles** — no access; negative tests enforce.
- **System/worker principal** — creates and advances runs from outbox events and the cron
  drain, carrying the event's organization context (BLUEPRINT §32 background-job rule).

## Scope (v1 honors these §39 required behaviors)
| §39 concept | v1 delivery |
| --- | --- |
| Trigger | Domain events via the outbox: `FormSubmitted` (any form or one form), `PersonCreated` |
| Condition | Deterministic comparisons over the trigger context (`equals` / `not_equals` / `contains`, dot-paths like `answers.<fieldId>`) |
| Action | `SEND_EMAIL` (with `{{path}}` interpolation), `ADD_TO_GROUP`, `ADD_TAG`, `WAIT` |
| Delay | **Durable**: `WAIT` sets `nextStepAt` and parks the run; the cron drain resumes it — never an in-memory sleep |
| Retry | Step failures retry with the shared `computeBackoff`, capped at 3 attempts, then the run is `FAILED` with its error |
| Idempotency | Trigger fan-out is exactly-once per event (outbox `ProcessedEvent`); each run advances under a guarded claim |
| Versioning | Publishing snapshots an immutable `WorkflowVersion`; **runs pin the version they started with** even if the workflow is re-published |
| Observability | Every run keeps a step-by-step timeline (`log`): step, status, timestamp, detail/error |
| Cancellation | Runs can be cancelled (only non-terminal states); cancelled runs are never claimed again; audited |

- **Explicitly excluded (non-goals, deferred):** branching/else paths, approval steps with
  escalation, schedule/webhook/manual triggers, cross-org templates, a visual DAG editor,
  per-action custom integrations, and workflow-created Tasks (no Task primitive yet —
  when Tasks land, `CREATE_TASK` becomes a step type here rather than a bespoke system).

## Data
Tenant-scoped models (registered in the tenant guard — these are app-facing):

- **WorkflowDefinition** — `organizationId`, `name`, `description?`, `status`
  (`DRAFT|PUBLISHED|PAUSED`), `trigger` (event type string), `triggerFormId?` (narrow
  `FormSubmitted` to one form; null = any), `draftConfig` (Json — conditions + steps),
  `publishedVersion?`, `archivedAt?`, timestamps.
- **WorkflowVersion** — immutable snapshot `(workflowId, version, config)`; unique pair.
- **WorkflowRun** — `workflowId`, `version` (pinned), `status`
  (`PENDING|RUNNING|WAITING|COMPLETED|FAILED|CANCELLED`), `currentStep`, `attempts`
  (per-step, reset on success), `nextStepAt`, `context` (Json trigger context), `log`
  (Json timeline), `personId?`, `triggeredByEventId?`, `lastError?`, timestamps.

Config JSON is interpreted solely by the pure `workflows/config.ts`
(`parseWorkflowConfig`, `evaluateConditions`, `interpolate`, `getPath`) — same pattern as
Forms' schema module.

## Engine architecture
The **database package owns orchestration** (claiming, step sequencing, waits, retries,
version pinning, logging) with **executors injected by the app** — mirroring
`outboxService.drain(registry)`. The dashboard's `workflow-runner.ts` supplies the real
executors (email via provider, group add via `groupService`, tag via `peopleService`) and
registers the outbox trigger handler that fans events out to matching published workflows.
Draining happens via `/api/cron/workflows` (durable backstop) and opportunistically after
form submissions.

`PersonCreated` is now emitted atomically with person creation (same-transaction outbox
write), so person-triggered workflows fire for both manual creation and form-driven
match-or-create.

## Permissions
`workflow.view` / `workflow.manage` — Owner/Admin only; pure matrix, negative-tested.
Conditions evaluate only over the run's own trigger context (data the org already owns) —
no cross-domain reads, keeping evaluation permission-safe (§39 "Condition").

## Audit
`workflow.created/updated/published/paused/resumed/archived/restored`,
`workflow.run_cancelled`, `workflow.run_retried`. Runs themselves are the durable record
of automated activity (the timeline), so per-run audit rows aren't duplicated.

## Failure modes
- Executor error → retry with backoff (≤3), then `FAILED` with the error in the timeline.
- Missing group/person at execution time → step fails with a clear message (retry may
  succeed if transient; a deleted target dead-letters the run visibly).
- Workflow re-published mid-run → in-flight runs keep their pinned version.
- Worker crash mid-run → guarded claim + stale reclaim returns the run to a drainable state.

## Tests
- **Unit (pure):** `parseWorkflowConfig` tolerance, `evaluateConditions` (all ops,
  dot-paths, missing paths), `interpolate` (replacement + unknown keys), the permission
  matrix (positive + negative for every role), tenant-guard registration.
- **Live smoke:** publish a workflow (condition + add-to-group + email + wait), submit a
  matching form → run executes steps and parks at WAIT; a non-matching submission creates
  no run; drain resumes and completes the waited run; version pinning across re-publish;
  step failure retries then dead-letters; cancellation.

## Migration
Additive migration `add_workflows` — new enums/tables/indexes only.

## Unresolved risks
- **Recursion** — a workflow that creates a person (`ADD_TO_GROUP` doesn't, but future
  actions might) could trigger `PersonCreated` workflows. v1's action set can't loop, but
  the engine should gain loop-depth guards before actions that emit events are added.
- **Fan-out scale** — trigger matching is per-event, per-org; fine at current scale, and
  the claim guard already permits multiple drainers when needed.
