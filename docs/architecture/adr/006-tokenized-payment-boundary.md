# ADR-006: Tokenized payment processor boundary

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
Giving is a first-class experience, but handling raw card/bank data brings heavy PCI/
regulatory scope. The church needs to own the donor experience and its financial facts —
not the regulated payment rails.

## Decision
Integrate a **Connect-style, compliant payment processor** and use processor-hosted/
tokenized payment components. The platform stores **only** processor references and church
financial facts (gifts, allocations, funds, deposits, refunds, reconciliation status).
**Never** store raw card numbers, CVV, or unrestricted bank credentials. Financial facts
are modeled as immutable/append-only events; refunds/adjustments reference the original and
never overwrite it. Provider IDs live in dedicated integration-reference tables to allow
future provider migration.

## Alternatives considered
- **Custom card processing / acquiring infrastructure** — massive regulatory burden; not
  our differentiation. Rejected (see BLUEPRINT §61).
- **Storing tokenized+raw data locally** — expands PCI scope unnecessarily. Rejected.

## Consequences
- Easier: dramatically reduced compliance scope; donor experience remains ours.
- Harder: reconciliation, failure/retry handling, and webhook idempotency must be robust;
  a real-money pilot and security/payments/legal review gate Phase 5.
