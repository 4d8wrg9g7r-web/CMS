# Journeys & Discipleship

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational)

Implements [BLUEPRINT §6 (Journeys & Discipleship)](../architecture/BLUEPRINT.md#6-journeys--discipleship)
— configurable pathways for next steps. Churches define their own models (the classic
First Visit → Connect Card → Follow-Up → Membership → Serve Team is an example, not a
hardcoded shape). Journeys compose `Person`, and — per §6's explicit rule that "journey
automation should use the central workflow engine rather than embed bespoke automation
logic" — enrollment is available as an `ENROLL_IN_JOURNEY` workflow step rather than a
private automation path.

## Problem
Churches lose people between first visit and belonging because next steps live in
spreadsheets. Staff need church-defined pathways with ordered milestones, per-person
progress, and automation hooks. Success = staff define a journey, enroll people (manually
or via workflow), check off milestones, and see who is stuck where.

## Actors
- **Owner / Admin** — define journeys, enroll people, complete milestones, view progress.
  (Same Confidential-Person posture as People/Groups/Tasks.)
- **Other roles** — no access; negative tests enforce.
- **System/worker principal** — enrolls people via the `ENROLL_IN_JOURNEY` workflow step.

## Scope
- **Included (v1):** journey definitions with **ordered milestones** (name, description,
  optional target days-to-complete); enrollment of a Person (unique per journey);
  milestone completion records (who/when); automatic journey completion when the last
  milestone completes; exit (drop out) with history preserved; progress views (per
  enrollment and per journey); a Journeys panel on the Person page; the
  `ENROLL_IN_JOURNEY` workflow step (idempotent — re-enrollment is a no-op); audit
  events.
- **Explicitly excluded (non-goals, deferred):** per-milestone staff assignments and due
  dates driving Task creation (compose a `CREATE_TASK` workflow step today; native
  milestone→task automation arrives with milestone-completion triggers), journey
  stages/branches, re-enrollment after completion, reporting dashboards beyond counts,
  and `JourneyMilestoneCompleted` / `JourneyCompleted` domain events (workflow trigger
  candidates once needed).

## Data
Tenant-scoped, all registered in the tenant guard. Milestones are a **relational child
table**, not JSON — they are core domain relationships referenced by completion records
(BLUEPRINT §36), unlike form fields which are genuinely flexible display schema.

- **JourneyDefinition** — `organizationId`, `name`, `description?`, `isActive` (inactive
  = closed to new enrollment; existing enrollments continue), `archivedAt?`, timestamps.
- **JourneyMilestone** — `organizationId`, `journeyId`, `name`, `description?`, `order`
  (unique per journey), `targetDays?` (soft expectation, informational in v1).
- **JourneyEnrollment** — `organizationId`, `journeyId`, `personId` (unique pair),
  `status` (`ACTIVE|COMPLETED|EXITED`), `enrolledByUserId?`, `workflowRunId?`
  (provenance, mirroring Task §40), `startedAt`, `completedAt?`, `exitedAt?`.
- **JourneyMilestoneCompletion** — `organizationId`, `enrollmentId`, `milestoneId`
  (unique pair), `completedByUserId?`, `completedAt`. Append-only in practice; deleting a
  milestone from a definition cascades its completions (editing a live journey's shape is
  a staff decision surfaced in the UI).

**Editing note:** adding/removing milestones affects in-flight enrollments (progress is
recomputed against the current milestone list). This is the intentional v1 behavior —
journeys are living pathways, unlike form schemas which version for historical
interpretability. Documented here and in the UI.

## Permissions
`journey.view` / `journey.manage` — Owner/Admin only; pure matrix, negative-tested;
enforced server-side via `requireJourneys`.

## Commands
`createJourney`, `updateJourney`, `setActive`, `archive/restore`; `addMilestone`,
`updateMilestone`, `removeMilestone`, `reorderMilestones`; `enroll` (idempotent on the
unique pair; returns existing enrollment), `completeMilestone` (auto-completes the
enrollment when it was the last one), `uncompleteMilestone`, `exitEnrollment`,
`reactivateEnrollment`. Audited per action.

## Queries
`listJourneys` (+ enrollment counts), `getJourney` (milestones ordered + enrollments with
progress), `listEnrollmentsForPerson` (Person panel), `getEnrollment`.

## Workflow integration
`ENROLL_IN_JOURNEY` step type (config: `journeyId`): enrolls the run's linked person,
carrying `workflowRunId` provenance; skips gracefully when the run has no person, the
journey is inactive/archived, or the person is already enrolled.

## UI states
List (permission-denied/empty/populated with counts); journey detail (milestone editor
with reorder, enrollment list with per-person progress bars and next milestone, enroll
form, complete/undo milestone actions, exit/reactivate); Person page panel (each active
journey with progress and next step).

## Failure modes
Enroll is idempotent; completing an already-completed milestone is a no-op (unique pair,
`skipDuplicates` semantics); milestone completion on a non-ACTIVE enrollment is refused;
removing a milestone recomputes progress and may auto-complete enrollments that now have
every remaining milestone done (checked at next completion, not retroactively — v1
simplification noted below).

## Audit
`journey.created/updated/activated/deactivated/archived/restored`,
`journey.milestone_added/updated/removed/reordered`, `journey.person_enrolled`,
`journey.milestone_completed/uncompleted`, `journey.enrollment_exited/reactivated`,
`journey.completed` — actor (null for workflow enrollments), target, safe metadata.

## Tests
- **Unit (pure):** permission matrix (positive + negative per role), `journeyProgress`
  helper (percent, next milestone, completion detection, empty-milestone edge),
  `ENROLL_IN_JOURNEY` config parsing, guard registration for all four models.
- **Live smoke:** define → enroll → complete milestones in order → auto-completion on the
  last; idempotent enroll; exit preserves history; workflow-step enrollment with
  provenance; Person panel query; cross-tenant isolation; guard throw.

## Migration
Additive migration `add_journeys` — four tables + enums, indexes, FKs; no existing
tables changed.

## Unresolved risks
- **Live-edit semantics** — recomputed progress after milestone edits can leave an
  ACTIVE enrollment with 100% completions until its next interaction; acceptable at v1
  scale, revisit with milestone-completion events.
- **Assignment/follow-up** — §6's "assignments, due dates, staff follow-up" is delivered
  compositionally (workflow → CREATE_TASK) rather than natively in v1.
