# ADR-009: API/webhook versioning strategy

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
Public API and webhooks are product capabilities designed early (principle #9), not
post-launch cleanup. External integrators depend on stable contracts, so breaking changes
must be managed deliberately.

## Decision
Expose **explicit versioned APIs** (REST as the default; GraphQL only where its benefits
justify the authorization/query-complexity cost). Public APIs run through the **same
application services** as first-party clients — never a bypass around authorization/business
rules. Use consistent resource naming, pagination, filtering, error envelopes, request IDs,
idempotency headers, and optimistic concurrency where needed. Webhooks are signed with
rotating secrets, include timestamp and event ID, retry with exponential backoff and
dead-letter visibility, and are replayable and inspectable. **Both API responses and
webhook payloads use versioned, documented schemas**; breaking changes require a new
version or compatible evolution. Payloads minimize sensitive content and never leak
internal columns or provider secrets.

## Alternatives considered
- **Unversioned "latest" API** — breaks integrators on every change. Rejected.
- **Separate internal API bypassing app services for speed** — creates an authorization
  bypass. Rejected.

## Consequences
- Easier: safe evolution, trustworthy third-party integrations, and clean migration story.
- Harder: version lifecycle management and deprecation discipline; serialization must be
  explicit to avoid leaking internal fields.
