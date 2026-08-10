# Attendance Reporting

## Why
Check-in (docs/domain/checkin.md) captures per-occurrence attendance but nothing makes
it visible: staff can't answer "how many came last Sunday?", "is fall attendance
trending up?", or "which events actually draw people?". This epic is the read side of
that data — reporting only, no new write paths.

## Scope (v1)
- **/attendance** dashboard page: summary cards (total check-ins, unique people,
  events attended, average per occurrence), a weekly trend chart, and a per-event
  summary table (occurrences, total, average, most recent occurrence) — all over a
  selectable range (last 30 / 90 / 365 days) and an optional campus filter (via the
  event's campus).
- **Event drill-down**: the event detail page gains an "Attendance history" card
  listing recent occurrences with head-counts.
- Charts are plain CSS bars — no charting dependency (a new dep needs an ADR, and
  weekly counts don't justify one).

## Authorization
New `attendance.view` action in the check-in matrix, granted to OWNER, ADMIN, **and
ANALYTICS_VIEWER** — the first data that role can see. The deliberate line:
`attendance.view` covers **aggregates only** (counts, trends, averages);
who-attended rosters remain behind `checkin.view` (OWNER/ADMIN), because per-person
attendance is Confidential (BLUEPRINT §62) while head-counts are operational metrics.
The /attendance page renders only aggregates, so ANALYTICS_VIEWER never sees a name;
the event check-in roster page keeps requiring `checkin.view`. Negative tests cover
both boundaries.

## Design decisions
- **Aggregate in code, not SQL.** The service fetches slim rows
  (`occurrenceAt`, `eventId`, `personId`) for the range; pure helpers in
  `checkins/helpers.ts` do the bucketing/summarizing. That keeps the logic fully
  unit-testable and avoids a thicket of per-shape `groupBy` queries. Range is capped
  at 366 days; at church scale (thousands of check-ins/year) this is comfortably
  in-memory. If volume ever demands it, the helpers' contracts stay and the fetch
  becomes SQL aggregation.
- **Weeks start on Sunday** (church weeks do). Bucketing uses UTC day arithmetic —
  consistent with `occurrenceAt` being stored as the occurrence's UTC instant.
- **Guests**: CheckIn rows without a personId (none are produced yet by the current
  UI, but the model allows them) count toward totals but not unique people.

## Data model
No schema changes — this epic reads the existing `CheckIn` table. The
`occurrenceAt` timestamp remains the occurrence identity.

## Verification
- Unit: week bucketing (boundaries, empty weeks padded, Sunday start), per-event
  summarizing (totals, distinct occurrences, averages, latest), unique-people
  counting incl. null personId; permission matrix positive + negative for the
  aggregates/roster boundary.
- Live smoke: seed check-ins across two occurrences and two events, verify range
  query, weekly buckets, per-event summary, campus filter.
