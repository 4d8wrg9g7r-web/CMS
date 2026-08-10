# Transactional Outbox & Event Worker

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** B (integrity-sensitive infrastructure)

Implements [BLUEPRINT §38 (Event and outbox architecture)](../architecture/BLUEPRINT.md#38-event-and-outbox-architecture)
and the foundation half of [§44 (Background jobs)](../architecture/BLUEPRINT.md#44-background-jobs-and-scheduling).
This is the substrate the workflow engine (§39) will run on, and it closes a real gap: the
Forms module previously performed all submission side effects inline. External and
cross-module effects now go through a durable, retryable, idempotent outbox — honoring
Constitution rule #5 ("no external side effects inside a database transaction").

## Problem
When a domain fact happens (a form is submitted, a person is created), the system often
needs to do something afterward — notify staff, later start a workflow. Doing that inline
couples the write to third-party availability and loses the effect on a crash. Success =
a domain event is recorded atomically with the state change, then processed after commit
with retries and at-most-once handler execution.

## Actors
- **System/worker principal** — the only actor. There is no user-facing UI in v1; the
  outbox is infrastructure. Draining runs from a cron route and opportunistically via
  `after()` following a request.

## Scope
- **Included (v1):** an `OutboxEvent` table written in the same transaction as the domain
  state that produced it; a durable worker that claims pending events, dispatches them to
  registered handlers, records per-handler idempotency, and retries with exponential
  backoff up to a cap; a `ProcessedEvent` ledger giving each handler at-most-once
  execution; and one concrete consumer — `FormSubmitted` → email the form's configured
  notification addresses. Draining is triggered by a cron route (`/api/cron/outbox`) and
  by `after()` post-submission for low latency.
- **Explicitly excluded (non-goals, deferred):** the user-configurable **workflow engine**
  (§39 — definitions, triggers, conditions, branches, delays, approvals, run history UI),
  a real message broker/queue (Postgres-backed claiming is sufficient at this scale), a
  dead-letter admin UI, and event schema/version negotiation beyond a `type` string.
  Emission is currently wired for `FormSubmitted`; other events (`PersonCreated`, etc.)
  adopt the same helper as consumers appear.

## Data
Infrastructure tables (carry `organizationId` for scoping and tenant-aware processing, but
are **not** in the app-facing tenant guard — they're touched only by `outbox-service`,
the same treatment as `PrayerWallSession`):

- **OutboxEvent** — `organizationId`, `type`, `payload` (Json), `status`
  (`PENDING|PROCESSING|COMPLETED|FAILED`), `attempts`, `maxAttempts`, `nextAttemptAt`,
  `lastError?`, `dedupeKey?`, timestamps, `processedAt?`. Indexed on
  `(status, nextAttemptAt)` for the claim scan.
- **ProcessedEvent** — `organizationId`, `eventId`, `handler`, timestamp. Unique
  `(eventId, handler)` — the idempotency ledger guaranteeing a handler runs at most once
  per event even if the event is delivered twice.

## Commands
`emit(tx, {...})` — insert an event **inside the caller's transaction** (atomic with the
state change). `claimBatch(limit)` — atomically move due `PENDING` events to `PROCESSING`.
`markCompleted(id)` / `markRetry(id, error)` (backoff) / `markFailed(id, error)` (dead).
`markProcessed(eventId, handler)` / `hasProcessed(eventId, handler)`.

## Queries
`claimBatch` and `countByStatus` (for future observability). Draining reads via the
service using `rawDb` with explicit organization context (documented worker exception,
BLUEPRINT §32 "background jobs carry organization + system-principal context").

## Events (v1 catalog)
- `FormSubmitted` — `{ formId, submissionId, version, personId, submitterEmail, submitterName }`.
  Emitted atomically with the `FormSubmission` insert.

## Handlers (v1)
- `notify-form-submission` (consumes `FormSubmitted`) — emails the form's
  `notificationEmails`. Idempotent via `ProcessedEvent`; a no-op when no addresses are set.

## Failure modes
- Handler throws → event returns to `PENDING` with `attempts++` and
  `nextAttemptAt = now + computeBackoff(attempts)`; after `maxAttempts` it is marked
  `FAILED` (dead-letter, visible in the table).
- Duplicate delivery → the second run sees `ProcessedEvent` and skips (at-most-once).
- Worker crash mid-event → the event stays `PROCESSING`; a stale-reclaim window returns
  long-`PROCESSING` events to `PENDING` (time-based, like the existing BulkJob stale
  detection).

## Audit
Not itself audited (infrastructure), but handler-driven mutations audit through the same
service/audit path as human actions when they mutate records.

## Tests
- **Unit (pure):** `computeBackoff` (monotonic, capped, jittered within bounds).
- **Live smoke:** emit within a transaction; drain runs the handler exactly once; a second
  drain does nothing (idempotency); a throwing handler retries with backoff and dead-letters
  after the cap; cross-tenant events are processed with their own org context.

## Migration
Additive migration `add_outbox` — new tables/enum/indexes only.

## Unresolved risks
- **`after()` reliability** — opportunistic draining via `after()` is best-effort; the
  cron route is the durable backstop. A production deployment must schedule
  `/api/cron/outbox` (documented alongside the existing `/api/cron/*` routes).
- **Claim race** — `claimBatch` uses a guarded conditional update so two workers can't
  claim the same event; at this scale a single drainer is expected, but the guard makes
  concurrent drainers safe.
- **Not yet the workflow engine** — this is the transport. User-configurable automation
  (§39) is the next epic and will register its own handlers here.
