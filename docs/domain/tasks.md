# Tasks

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational)

Implements [BLUEPRINT §26 (Tasks & Projects)](../architecture/BLUEPRINT.md#26-tasks--projects)
and [§40 (Task engine specification)](../architecture/BLUEPRINT.md#40-task-engine-specification)
— the universal work layer. HR onboarding, facilities maintenance, pastoral follow-up, and
event planning are all meant to compose this one engine rather than inventing their own
to-do lists. Tasks is also the workflow engine's first record-creating action: the new
`CREATE_TASK` step type creates real tasks with run provenance
([docs/domain/workflows.md](./workflows.md)).

## Problem
Follow-up work ("call this first-time guest") lives in staff heads or external tools.
Staff need one assignable, trackable work item tied to the records it's about — and
automation needs to be able to create those items. Success = staff see and complete a task
list; workflows create tasks that record *why they exist*.

## Actors
- **Owner / Admin** — full view + manage. (v1 posture matches People: tasks routinely
  reference Confidential Person records, and §40 says task permissions inherit
  related-entity sensitivity. Finer-grained assignee-only visibility comes with broader
  role work.)
- **Other roles** — no access; negative tests enforce.
- **System/worker principal** — creates tasks from `CREATE_TASK` workflow steps.

## Scope
- **Included (v1):** Task with title, description, status (`OPEN|IN_PROGRESS|COMPLETED|
  CANCELLED`), priority (`LOW|NORMAL|HIGH|URGENT`), due date, assignee (an
  `OrganizationMember`'s User), related `Person`, workflow-run provenance
  (`workflowRunId`, §40), complete/reopen/cancel, list with status/assignee filters and
  overdue indication, a follow-ups panel on the Person detail page, audit events, and the
  `CREATE_TASK` workflow step (with `{{path}}` interpolation in title/description).
- **Explicitly excluded (non-goals, deferred):** checklists, comments, attachments,
  recurrence, dependencies, project boards, templates, Team assignees, notifications, and
  related entities beyond Person (Group/Event/Facility relations arrive with those
  modules' needs — additive nullable FKs, same pattern as `relatedPersonId`).

## Data
Tenant-scoped model (registered in the tenant guard):

- **Task** — `organizationId`, `title`, `description?`, `status` (default `OPEN`),
  `priority` (default `NORMAL`), `dueAt?`, `assigneeUserId?` (SetNull), `relatedPersonId?`
  (SetNull — deleting a person never deletes work history), `workflowRunId?` (SetNull —
  provenance, §40 "so users can understand why they exist"), `createdByUserId?`,
  `completedAt?`, timestamps. Indexed on `(organizationId, status)` and assignee/person.

Tasks use status transitions rather than soft archival: `CANCELLED` is the terminal
"never mind" state and completed/cancelled history is preserved.

## Permissions
`task.view` / `task.manage` — Owner/Admin only (pure matrix, negative-tested), enforced
server-side via `requireTasks`. Workflow-created tasks are written by the worker principal
through the tenant-scoped service.

## Commands
`createTask`, `updateTask`, `setStatus` (complete stamps `completedAt`; reopen clears it),
plus the `CREATE_TASK` workflow executor. Each staff mutation records an audit event;
workflow-created tasks carry provenance instead (the run timeline is the audit trail).

## Queries
`listTasks(orgId, {status, assigneeUserId, relatedPersonId, includeClosed, skip, take})` —
open tasks ordered by due date (soonest first, undated last); `countTasks`; `getTask`;
`listTasksForPerson` (Person-detail panel).

## Events
None emitted in v1. `TaskCompleted` becomes a workflow trigger candidate later (§39's
escalation example needs it).

## UI states
List: permission-denied panel, empty, filtered-empty, populated with overdue highlighting;
create form; inline complete/reopen/cancel. Person detail gains a read-only follow-ups
panel with a prefilled "new task" link.

## Failure modes
Status transitions are guarded server-side (no completing a cancelled task). A
`CREATE_TASK` step with a dangling assignee simply creates the task unassigned rather than
failing the run.

## Audit
`task.created`, `task.updated`, `task.completed`, `task.reopened`, `task.cancelled` —
actor, target, safe metadata.

## Tests
- **Unit (pure):** the permission matrix (positive + negative per role), guard
  registration, `isOverdue` helper, and `CREATE_TASK` config parsing in the workflow
  config suite.
- **Live smoke:** create/complete/reopen via the service; a workflow `CREATE_TASK` step
  creates a task carrying `workflowRunId` and interpolated context; `listTasksForPerson`;
  cross-tenant isolation.

## Migration
Additive migration `add_tasks` — new enums/table/indexes only.

## Unresolved risks
- **Visibility model** — v1 is Owner/Admin-wide. When Staff/HR (Phase 4) or pastoral care
  land, per-domain task sensitivity (§40 "inherit related-entity sensitivity") needs a
  policy richer than the flat matrix; that change rides with those modules.
