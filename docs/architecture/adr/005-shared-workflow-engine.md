# ADR-005: Shared workflow engine

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
Many modules need automation: follow-up on a first visit, remind about expiring training,
escalate an unfinished task. If each module builds its own automation, the platform
accumulates incompatible, unobservable, unauditable mini-engines.

## Decision
Provide **one shared workflow engine** that all modules compose. It supports triggers
(domain event, schedule, manual, webhook, form submission), permission-safe conditions,
actions, durable delays (not in-memory sleep), deterministic branches, human approvals
with escalation, retries with backoff, idempotency, versioning (existing runs keep the
version they started with), full-timeline observability, and safe cancellation. Workflow-
created tasks retain `workflow_run_id` for provenance.

## Alternatives considered
- **Per-module automation logic** — violates the "workflows compose shared primitives"
  principle; fragments observability and audit. Rejected.
- **Third-party workflow SaaS as the core engine** — loses permission-awareness and tight
  domain integration; may be an integration target, not the core. Rejected as core.

## Consequences
- Easier: consistent, inspectable, auditable automation across every module.
- Harder: the engine is foundational infrastructure (Phase 0) and must be robust before
  modules lean on it; versioning of in-flight runs adds complexity.
