# Communications (Message log & consent)

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational; delivery integrity via the outbox)

Implements the foundation slice of [BLUEPRINT §19 (Communications)](../architecture/BLUEPRINT.md#19-communications)
and the Foundation checklist's "Message/template/channel abstraction with
consent/preferences": the canonical **Message** primitive (§4 — "outbound/in-app
communication record"). Every outbound email the platform sends — workflow `SEND_EMAIL`
steps, form notifications — now flows through one durable, consent-aware message log
delivered by the outbox worker, instead of scattered fire-and-forget provider calls.

## Problem
The platform already sends email from three places (workflow steps, form notifications,
team invites) with no record, no retry, no delivery status, and no way for a person to
opt out. §19 requires delivery status, communication history, and explicitly modeled,
auditable consent. Success = staff see every message the platform sent (to whom, from
what source, delivered or failed), failed sends retry/are resendable, and an opted-out
person is never emailed by bulk/automated paths.

## Actors
- **Owner / Admin** — view the message log, resend failed messages, manage a person's
  email consent (audited).
- **Other roles** — no access (message contents and recipients are Confidential);
  negative tests enforce.
- **System/worker principal** — delivers queued messages via the outbox handler.

## Scope
- **Included (v1):** `Message` model (channel `EMAIL`, recipient email + optional Person
  link, subject/body, `QUEUED|SENT|FAILED` status, source tag + workflow-run provenance,
  error capture, timestamps); `queueMessage` writing the row and its `MessageQueued`
  outbox event in one transaction; delivery via the outbox worker (provider send →
  `SENT`/`FAILED` with retries inherited from the outbox); **consent** —
  `Person.emailOptedOutAt`, enforced in `queueMessage` for person-linked sends
  (suppressed, recorded as `FAILED` with reason "opted out": history without delivery),
  toggled only by staff with an audit event; retargeted senders — workflow `SEND_EMAIL`
  and form notifications now queue messages; staff resend for failed messages; a
  `/messages` history UI and a Person-detail messages panel + consent toggle.
- **Explicitly excluded (non-goals, deferred):** SMS/push channels (the `channel` enum
  is ready), templates/campaigns/segments/scheduled sends, bounce webhook ingestion,
  reply metadata, per-channel granular preferences (one email opt-out flag in v1), and a
  public unsubscribe link (requires signed tokens — deliberate follow-up before any
  bulk-marketing use; v1 senders are transactional/staff-triggered).

## Data
- **Message** — `organizationId`, `channel` (`EMAIL`), `toEmail`, `toPersonId?`
  (SetNull), `subject`, `body`, `status` (`QUEUED|SENT|FAILED`), `source` (e.g.
  `workflow`, `form_notification`, `manual_resend`), `workflowRunId?` (provenance),
  `error?`, `sentAt?`, timestamps. Tenant-guarded.
- **Person.emailOptedOutAt** — timestamped consent state (§19 "timestamped and
  auditable"); changes audited as `person.email_opt_out_set/cleared`.

## Permissions
`message.view` / `message.manage` — Owner/Admin only (pure matrix, negative-tested),
enforced via `requireMessages`. Consent toggling requires `person.manage` (it lives on
the Person) **and** is audited.

## Commands
`queueMessage` (consent check → Message row + `MessageQueued` outbox emit in one
transaction), `markSent` / `markFailed` (worker), `resend` (staff: re-queues a FAILED
message as a new message with `source: manual_resend`), `setEmailOptOut` (people-service;
audited by callers).

## Queries
`listMessages(orgId, {status, source, personId})`, `countMessages`,
`listMessagesForPerson` (Person panel).

## Delivery
The `MessageQueued` outbox handler loads the message, sends via `getEmailProvider()`, and
marks `SENT`/`FAILED`. Outbox retries with backoff apply to transient provider errors;
after the outbox dead-letters, the message rests at `FAILED` with its error and can be
resent manually. Idempotency: the handler skips messages no longer `QUEUED`, and the
outbox ProcessedEvent ledger prevents double-send on duplicate delivery.

## Audit
`message.resent`, `person.email_opt_out_set`, `person.email_opt_out_cleared`. Individual
sends are not double-audited — the Message row IS the communication history (§19).

## Tests
- **Unit (pure):** permission matrix (positive + negative per role), guard registration,
  `canEmail` consent helper.
- **Live smoke:** queueMessage → drain → SENT with provider called; opted-out
  person-linked send suppressed as FAILED("opted out") without provider call; failed
  provider send → outbox retry → dead-letter FAILED; resend re-queues; workflow
  SEND_EMAIL and form notification produce Message rows; cross-tenant isolation; guard.

## Migration
Additive migration `add_messages` — Message table + enums + `Person.emailOptedOutAt`.

## Unresolved risks
- **Consent scope** — the opt-out is enforced for person-linked sends; sends addressed to
  raw staff emails (form notifications to the office) bypass it by design. When
  bulk/member-facing campaigns arrive, consent must gate on recipient email too, plus a
  signed public unsubscribe flow.
- **Delivery status fidelity** — SENT means "provider accepted"; bounce ingestion (§19
  "bounce/failure handling") needs provider webhooks, deferred with the adapter work.

## Email blasts / newsletters
`EmailBlast` is one composed email fanned out to an audience as individual
consent-checked Message rows (source `blast`, FK `blastId`) — delivery, retries,
and failure surfacing all inherit the existing outbox pipeline. Audiences
(`messaging/audience.ts`, pure + validated): everyone with an email, a filter
(status/campus/tag), a group, or hand-picked people (capped at 500); recipients
dedupe case-insensitively by email, people without an email are counted and
skipped, and queueMessage records opt-out suppressions as visible FAILED rows.
Bodies are markdown rendered to email HTML at send time by the escaping renderer
in @cms/email (raw HTML can never survive; links restricted to http(s)/mailto).
Attachments (≤5 files, ≤8 MB total) store bytes in private storage with metadata
on `EmailBlastAttachment`; the worker fetches bytes per send and passes them to
the provider (Resend supports html + attachments; the console stub logs them).
Composer at /messages/new (live preview via the same renderer), history + counts
on /messages with per-blast detail (sent/sending/failed/suppressed/no-email,
failure list). Audited as `message.blast_sent`.

## Newsletter designer (blocks)
Blasts can carry a designed layout: `EmailBlast.blocks` (Json, nullable) stores a
validated array of content blocks — image / heading / text / button / divider
(`@cms/email` blocks.ts, ≤40 blocks). The composer at /messages/new is a block
builder (add/reorder/remove, live preview); `bodyMarkdown` holds the plain-text
derivation of the blocks (used for the text/plain part and older markdown blasts).
Rendering rules: every text field HTML-escaped, image/button URLs restricted to
http(s), text blocks reuse the escaping markdown renderer; the worker re-validates
stored blocks per send and falls back to the markdown body if invalid. Inline
images upload to PUBLIC storage (Vercel Blob in prod, public/uploads locally,
absolutized from the request origin) because recipients' mail clients fetch them
by URL — attachments stay in private storage. Audience filters also cover custom
person fields (key = value, case-insensitive on the formatted value). The People
list and the report builder both link into the composer with the current filters
prefilled as the audience (`/messages/new?audienceKind=filter&…`). Templates
later = saved block arrays; nothing else needs to change.
