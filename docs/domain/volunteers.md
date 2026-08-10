# Volunteers & Serving Teams

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational)

Implements the lifecycle core of [BLUEPRINT §10 (Volunteers)](../architecture/BLUEPRINT.md#10-volunteers)
and the `Team/Position` primitive (§4/§62): serving teams, positions with
**policy-driven qualification requirements**, person assignments, and computed
eligibility. Composes `Person` (assignments and qualifications hang off the canonical
record) and sets up scheduling/rotations to compose Events later.

> **Background checks are out of scope.** §10's "Kids Leader requires current background
> check" example involves background-check *handling*, which is §66 human-review
> territory. v1 models qualifications as named, expiring credentials a staff member
> records (e.g. "child-safety-training", "background-check-cleared" as an externally
> managed fact) — the platform stores status + expiry, never provider results or reports.

## Problem
Volunteer coordination lives in spreadsheets: who serves where, who is qualified, whose
training expired. Staff need teams/positions, assignments from the People graph, and
eligibility that *flags* rather than silently blocks or deletes history. Success = staff
define teams and requirements, assign people, and see expired/missing qualifications
surfaced on the roster.

## Actors
- **Owner / Admin** — full manage (qualifications are Confidential; §62 posture).
- **Other roles** — no access; negative tests enforce.

## Scope
- **Included (v1):** ServingTeam (campus-aware), ServingPosition with
  `requiredQualifications` (names), ServingAssignment (person ↔ position, ACTIVE/
  INACTIVE with history preserved), PersonQualification (name + optional expiry,
  staff-recorded), pure `isEligible` evaluation (missing vs expired, flagged not
  blocking — §10 "expired requirements should flag eligibility"), eligibility badges on
  rosters, Person panels (serving + qualifications management), audit events.
- **Explicitly excluded (non-goals, deferred):** scheduling/rotations/blockout dates/
  substitutions (compose Events next), background-check integration (above), training
  courses driving qualifications automatically (Learning module), `TrainingExpired`
  workflow trigger (needs a scheduled scanner; the workflow engine is ready for it),
  team-leader self-service roles.

## Data
Tenant-scoped, all guard-registered:
- **ServingTeam** — `organizationId`, `name`, `description?`, `campusId?`
  (SetNull), `archivedAt?`, timestamps.
- **ServingPosition** — `organizationId`, `teamId` (Cascade), `name`,
  `requiredQualifications String[]` (names matched against PersonQualification),
  timestamps.
- **ServingAssignment** — `organizationId`, `positionId` (Cascade), `personId`
  (Cascade), `status` (`ACTIVE|INACTIVE` — deactivation preserves serving history, §10
  "should not silently delete schedule history"), `startedAt`, `endedAt?`. Unique
  `(positionId, personId)`.
- **PersonQualification** — `organizationId`, `personId` (Cascade), `name`,
  `grantedAt`, `expiresAt?`, `notes?`. Unique `(personId, name)`.

## Eligibility (pure, §10 "policy-driven")
`isEligible(required, qualifications, now)` → `{ eligible, missing[], expired[] }`.
Eligible iff every required name has an unexpired qualification. Surfaced as flags on
rosters; assignment is never auto-revoked.

## Permissions
`volunteer.view` / `volunteer.manage` — Owner/Admin; pure matrix, negative-tested;
enforced via `requireVolunteers`.

## Commands
Teams/positions CRUD (+ archive/restore); `assign` (idempotent; reactivates an INACTIVE
row), `deactivateAssignment`; `grantQualification` (upsert with new expiry),
`revokeQualification`. All audited.

## Queries
`listTeams` (+ counts), `getTeam` (positions → assignments → person + qualifications for
eligibility), `listServingForPerson`, `listQualificationsForPerson`.

## Audit
`serving.team_created/updated/archived/restored`, `serving.position_created/updated/
removed`, `serving.assigned/assignment_deactivated`,
`person.qualification_granted/revoked`.

## Tests
- **Unit (pure):** `isEligible` (missing, expired-at-boundary, no requirements, extra
  quals), permission matrix negatives, guard registration ×4.
- **Live smoke:** team/position/assignment lifecycle incl. idempotent re-assign +
  reactivation, qualification grant/expiry flagging, history preservation on
  deactivate, cross-tenant isolation, guard.

## Migration
Additive `add_volunteers` — four tables + enum, indexes, FKs.

## Unresolved risks
- **Qualification names are free-form** per org (v1); a managed vocabulary + Learning-
  driven automation is the follow-up.
- **TrainingExpired automation** needs a scheduled scan emitting outbox events —
  natural cron addition once churches rely on expiries.
