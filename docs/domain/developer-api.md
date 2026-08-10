# Developer platform: Public API & Webhooks

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational; delivery integrity via retries)

Implements the first slice of [BLUEPRINT §42 (API conventions)](../architecture/BLUEPRINT.md#42-api-conventions)
and [§43 (Webhook conventions)](../architecture/BLUEPRINT.md#43-webhook-conventions) —
principle #9: "public API and webhooks are designed early." The API runs **through the
same application services as first-party clients** (never a bypass), and outbound
webhooks are **signed, retried, inspectable, and replayable**, delivered off the
existing outbox.

## Problem
Churches integrate: they want their website or tools to read events/groups, push new
people in, and react when something happens. Success = an admin mints an API key, calls
`/api/v1/*` with it, subscribes a URL to events, and receives signed deliveries they can
verify, inspect, and replay.

## Actors
- **Owner / Admin** — manage API keys and webhook subscriptions (§34 Platform Security
  domain: "org admin/security admin").
- **Server integrations** — hold an API key (org-scoped server credential).
- **Webhook consumers** — receive signed POSTs; verify with the subscription secret.

## Scope
- **Included (v1):**
  - **API keys** — `rk_`-prefixed secrets shown **once** at creation; only a SHA-256
    hash is stored (Web-Crypto, Edge-safe); prefix retained for display; revocable;
    `lastUsedAt` tracked. Keys are **org-scoped server credentials** (§42's "service
    credentials for trusted server integrations").
  - **REST v1** — `GET/POST /api/v1/people`, `GET /api/v1/events` (published),
    `GET /api/v1/groups`; Bearer auth; per-key rate limiting; consistent
    `{ data } | { error }` envelope; purpose-built read models (no raw entity leakage,
    §42). `POST /people` runs through `peopleService.createPerson`, so `PersonCreated`
    workflows and webhooks fire exactly like first-party creation.
  - **Webhooks** — subscriptions (URL + chosen event types + per-subscription secret);
    deliveries created by an outbox handler for `FormSubmitted` / `PersonCreated` /
    `EventRegistered`; each POST carries `X-CMS-Event`, `X-CMS-Delivery`,
    `X-CMS-Timestamp`, and `X-CMS-Signature` (HMAC-SHA256 of
    `"<timestamp>.<body>"`); per-delivery status/attempts/response-code recorded;
    failed deliveries retry from the cron drain (capped attempts) and are manually
    **replayable** (§43); payloads carry references + summary fields, not full records
    (§43 "minimize sensitive content").
  - `/developers` UI — keys (create/reveal-once/revoke), subscriptions
    (create/toggle/delete, secret visible to admins), delivery log with replay.
- **Explicitly excluded (non-goals, deferred):** scoped OAuth for user-authorized
  third parties, granular key scopes (read-only etc.), secret rotation UX (§43 —
  create-new + delete covers v1), API versioning beyond `/v1`, OpenAPI docs, webhook
  event-schema versioning beyond the envelope's `type`, and additional resources
  (registrations, tasks) as consumers ask.

## Data
- **ApiKey** — `organizationId`, `name`, `keyHash` (unique), `keyPrefix`,
  `createdByUserId?`, `lastUsedAt?`, `revokedAt?`. Key resolution is a documented rawDb
  bootstrapping path (no org context until the hash matches).
- **WebhookSubscription** — `organizationId`, `url`, `secret`, `events String[]`,
  `isActive`.
- **WebhookDelivery** — `organizationId`, `subscriptionId`, `eventId`, `eventType`,
  `payload Json`, `status` (`PENDING|DELIVERED|FAILED`), `attempts`, `responseStatus?`,
  `lastError?`, `deliveredAt?`.

All three guard-registered.

## Security notes
- Plaintext keys are unrecoverable (hash-only storage); revocation is immediate at
  resolution time.
- Signatures use Web Crypto HMAC (Edge-safe); consumers reject stale timestamps to
  bound replay windows (documented in the UI).
- Webhook URLs are operator-supplied; deliveries run from the worker with a 10 s
  timeout. SSRF hardening (blocking private address ranges) is flagged as a follow-up
  before untrusted-tenant SaaS exposure.

## Audit
`apikey.created/revoked`, `webhook.subscription_created/updated/deleted`,
`webhook.delivery_replayed`. API writes audit as their underlying actions (e.g.
`person.created` metadata notes `via: api`).

## Tests
- **Unit (pure/crypto):** key generation format + hash stability, HMAC sign/verify
  roundtrip + tamper detection, permission matrix negatives, guard registration ×3.
- **Live smoke:** key create→resolve→revoke; delivery fan-out honors event filter +
  active flag; signature verifies; failed delivery retry + replay reset; cross-tenant
  isolation.

## Migration
Additive `add_developer_api` — three tables + enum.

## Unresolved risks
- **Key scope breadth** — a v1 key is full-org; scoped keys/OAuth before third-party
  marketplace exposure.
- **SSRF** — see security notes; acceptable for operator-configured endpoints in the
  current deployment, must harden before open SaaS.
