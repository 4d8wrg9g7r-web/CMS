# Check-In (Attendance foundations)

**Status:** Implemented (v1 — adult/general attendance only)
**Owner:** Platform
**Reliability tier:** A-track (blueprint targets Sunday-critical for full Check-In; this
v1 foundation is an ordinary transactional feature and must evolve toward §50 Tier A
hardening before Sunday-morning use at scale)

Implements the **attendance foundations** of [BLUEPRINT §12 (Check-In)](../architecture/BLUEPRINT.md#12-check-in):
per-occurrence attendance records composing the Event and Person primitives. This
materializes occurrence identity exactly where the Events spec said it would
([docs/domain/events.md](./events.md) "Recurrence strategy"): a `CheckIn` row keys on
`(eventId, occurrenceAt, personId)` — the occurrence timestamp from `expandOccurrences`
IS the occurrence identity; no separate occurrence table until something else needs one.

> **Child safety is explicitly out of scope.** Child check-in, guardian authorization,
> security codes, allergies, and label printing are Highly Restricted/child-safety
> features that the Constitution routes through human review (§66). This v1 handles
> general/adult attendance only and builds nothing child-specific.

## Problem
Churches can publish events and take registrations, but attendance lives on paper. Staff
need to mark who actually came to which occurrence of which event, see counts, and view a
person's attendance history. Success = open an occurrence roster, tap to check people in
(registrants first, anyone by search), fix mistakes, see totals.

## Actors
- **Owner / Admin** — record and view attendance. (CheckIn is Confidential/Restricted,
  §62.) Kiosk/station modes with their own principals are a later phase.
- **Other roles** — no access; negative tests enforce.

## Scope
- **Included (v1):** `CheckIn` records keyed by event + occurrence + person; an
  occurrence picker on the event page; a roster page (REGISTERED registrants first, then
  any person) with one-tap check-in, check-out (departure time), and undo (mistake
  removal, audited); occurrence attendance counts; a Person attendance panel; audit
  events.
- **Explicitly excluded (non-goals, deferred):** everything child-safety (above), kiosk/
  station/QR self check-in, label printing, volunteer check-in distinctions, offline/
  degraded-mode operation and the §12 reliability hardening (graceful degradation,
  aggressive performance testing) — required before real Sunday-critical use, tracked as
  the Tier-A gap.

## Data
- **CheckIn** — `organizationId`, `eventId`, `occurrenceAt` (the occurrence's start
  instant), `personId`, `checkedInByUserId?`, `checkedInAt`, `checkedOutAt?`. Unique
  `(eventId, occurrenceAt, personId)` (idempotent check-in); indexed for occurrence
  rosters and person history. Person/Event cascade rules preserve org history sensibly
  (person delete cascades their check-ins; event delete cascades the event's).

## Permissions
`checkin.view` / `checkin.manage` — Owner/Admin only; pure matrix, negative-tested;
enforced via `requireCheckin`.

## Commands
`checkIn` (idempotent; verifies event + person belong to the org), `checkOut` (stamps
departure), `undoCheckIn` (deletes the row — a mistake correction, distinct from
check-out, and audited as `checkin.removed`).

## Queries
`listForOccurrence` (roster with persons), `countForOccurrence`,
`listCheckInsForPerson` (history panel), occurrence summaries per event.

## Audit
`checkin.recorded`, `checkin.checked_out`, `checkin.removed` — actor, event target,
person + occurrence metadata.

## Tests
- **Unit (pure):** permission matrix (positive + negative per role), guard registration.
- **Live smoke:** idempotent check-in; two occurrences of the same event keep separate
  rosters; check-out stamps; undo removes; person history; cross-tenant isolation; guard.

## Migration
Additive migration `add_checkins` — one table, indexes, FKs.

## Unresolved risks
- **Tier-A gap** — this is transactional attendance, not yet Sunday-morning-hardened
  (§50): no offline caching, no station monitoring, no load testing. Do not position it
  as production check-in until that work lands.
- **Occurrence key drift** — if an event's `startAt`/recurrence changes, historical
  `occurrenceAt` keys still reflect the occurrences that actually happened (attendance
  is a record of the past); rosters for future occurrences follow the new rule.
