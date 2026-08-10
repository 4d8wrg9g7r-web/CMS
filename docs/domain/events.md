# Events, Calendar & Registrations

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational; registration integrity matters but no payments in v1)

Implements the canonical **Event primitive** from
[BLUEPRINT §13](../architecture/BLUEPRINT.md#13-events-calendar--registrations) and the
Foundation checklist's "canonical event primitive and recurrence strategy." One event
object drives the staff calendar, the public page, and registrations — no duplicate
entry. Registrations compose `Person` (match-or-create, like Forms) and feed the workflow
engine through a new `EventRegistered` trigger, so *register → enroll in journey / create
task / notify staff* composes without new automation code.

## Problem
Events live in three places today: a flyer, a spreadsheet of sign-ups, and someone's
memory of "every Wednesday." Staff need one event record with a recurrence answer, a
shareable public page, and registrations that land in the same Person graph as everything
else. Success = create an event once, share `/e/<id>`, watch registrations appear with
capacity enforced and automation firing.

## Actors
- **Owner / Admin** — full manage + registrations access.
- **Content Manager** — may **view and manage event definitions** (events are
  Public/Internal content, §62) but **not** view registrations (Confidential Person
  links). This is the platform's first deliberately non-uniform matrix — §34's "what
  action, on which data" in practice.
- **Analytics Viewer / Prayer Moderator** — no access; negative tests enforce.
- **Public visitor** — views a *published* event and registers, resolved by `publicId`
  (the standard publicId bootstrapping boundary), rate-limited.

## Scope
- **Included (v1):** Event with title/description/location, start/end, all-day flag,
  optional campus (first-class `Campus` primitive), **recurrence** (`NONE|DAILY|WEEKLY|
  MONTHLY` + interval + optional until — see strategy below), capacity, publish flag +
  public page, registration (name/email → match-or-create Person; idempotent per
  event+person; capacity-guarded; cancellable), an `EventRegistered` outbox event emitted
  atomically and exposed as a **workflow trigger**, staff UI (list with upcoming
  occurrences, editor, registrations inbox), audit events.
- **Explicitly excluded (non-goals, deferred):** rooms/resources/setup windows,
  registration products/payments/discounts/waivers, waitlists, household registration,
  per-occurrence registration and attendance (arrives with Check-In, Phase 3), attendee
  messaging (Communications engine), iCal feeds, and RRULE exceptions (skip/move one
  occurrence).

## Recurrence strategy (the Foundation checklist item)
**Compute-on-read, materialize later.** Recurrence lives as three fields on the Event
(`recurrence`, `recurrenceInterval`, `recurrenceUntil`); the pure `expandOccurrences`
helper computes occurrence dates in a window (capped) for calendars and the public page.
No occurrence rows exist in v1 — registrations attach to the event (series). When
Check-In needs per-occurrence attendance (Phase 3), occurrences materialize into rows at
that point; the stored rule is the source of truth either way. MONTHLY recurs on the
start date's day-of-month; months lacking that day (e.g. the 31st) are skipped rather
than shifted — documented, deterministic behavior.

## Data
Tenant-scoped (registered in the tenant guard):

- **Event** — `organizationId`, `title`, `description?`, `location?`, `startAt`,
  `endAt?`, `allDay`, `recurrence` (`NONE|DAILY|WEEKLY|MONTHLY`), `recurrenceInterval`
  (default 1), `recurrenceUntil?`, `capacity?` (null = unlimited), `isPublished`,
  `publicId` (unique), `campusId?` (SetNull), `archivedAt?`, timestamps.
- **EventRegistration** — `organizationId`, `eventId`, `personId?` (SetNull — history
  survives person deletion), `name`, `email?`, `status` (`REGISTERED|CANCELLED`),
  `workflowRunId`-style provenance is not needed (registrations are user acts), unique
  `(eventId, personId)` where personId set; timestamps.

**Classification:** Event = Public/Internal (§62); registrations = Confidential.

## Permissions
| Action | OWNER | ADMIN | CONTENT_MANAGER | others |
| --- | --- | --- | --- | --- |
| `event.view` | ✅ | ✅ | ✅ | ❌ |
| `event.manage` | ✅ | ✅ | ✅ | ❌ |
| `event.registrations.view` | ✅ | ✅ | ❌ | ❌ |

Pure matrix, negative-tested; enforced via `requireEvents`. Public registration is
unauthenticated, `publicId`-scoped, rate-limited (§48).

## Commands
`createEvent`, `updateEvent`, `setPublished`, `archive/restore`; `register` (public:
resolve → capacity check → match-or-create Person → registration + `EventRegistered`
outbox emit in one transaction; idempotent per event+person), `cancelRegistration`
(staff). Staff mutations audited; public registrations audited as
`event.registration_received` with a null actor.

## Queries
`listEvents` (+ registration counts, upcoming-first), `getEvent` (with registrations),
`resolvePublicEvent(publicId)` (published only; rawDb bootstrapping exception),
`listRegistrations`.

## Workflow integration
New trigger **`EventRegistered`** (narrowable to one event via the existing
`triggerFormId` column pattern — reused as a generic `triggerFormId`? No: a dedicated
`triggerEventId` would duplicate the column's purpose; v1 keeps the trigger org-wide and
conditions narrow by `eventId` path — documented below). Context:
`{eventId, eventTitle, registrantName, registrantEmail, personId}`. Composes existing
steps: enroll in journey, create task, add to group, email.

## UI states
Staff: permission-denied, empty list, upcoming list with recurrence labels and next
occurrences, editor, registrations inbox (Owner/Admin only), public-link card. Public:
not-found/unpublished, event details + next occurrences, register form with
success/full/closed states.

## Failure modes
Registration on a full event → clear "event full" (counted over `REGISTERED` only);
duplicate person registration → idempotent "already registered"; unpublished/archived →
not found. Person match/create failures never lose the registration row (store-first,
same as Forms).

## Audit
`event.created/updated/published/unpublished/archived/restored`,
`event.registration_received`, `event.registration_cancelled`.

## Tests
- **Unit (pure):** `expandOccurrences` (NONE single, DAILY/WEEKLY interval math, MONTHLY
  day-of-month incl. 31st-skip, until-bound, window clipping, output cap), permission
  matrix (incl. the Content-Manager-no-registrations split), guard registration.
- **Live smoke:** create/publish → public resolve → register (capacity, idempotency,
  match-or-create) → `EventRegistered` emitted atomically → workflow trigger fires a
  composed step; cross-tenant isolation; guard throw.

## Migration
Additive migration `add_events` — two tables + enums, indexes, FKs.

## Unresolved risks
- **Trigger narrowing** — `EventRegistered` workflows narrow by condition
  (`eventId equals …`) rather than a dedicated column; a `triggerEventId` column (or a
  generalized `triggerRef`) is a small follow-up if condition-narrowing proves clumsy.
- **Timezones** — timestamps are stored UTC and rendered in server locale; per-org
  timezone display (§36) is a platform-wide follow-up, not events-specific.
