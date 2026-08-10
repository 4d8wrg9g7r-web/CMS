# ADR-004: Outbox for cross-module/external side effects

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
Feature code frequently needs to do something external — send an email, call a provider,
notify another module — as part of a state change. Performing those effects inside the
database transaction risks partial failures, long-held locks, and lost or duplicated
effects.

## Decision
Adopt the **transactional outbox** pattern. Write domain state and its outbound event
record in the same transaction. A durable worker publishes/processes outbox events after
commit, with retries and idempotency. Domain events describe facts that already happened
(`PersonCreated`, `GiftSucceeded`, `TrainingExpired`). Consumers must tolerate duplicate
delivery; every side-effecting handler needs an idempotency strategy. Events are versioned
contracts.

## Alternatives considered
- **Direct external calls inside the transaction** — violates Constitution rule #5;
  couples commit success to third-party availability. Rejected.
- **Fire-and-forget after commit (no outbox)** — effects lost on crash between commit and
  dispatch. Rejected.

## Consequences
- Easier: reliable, retryable, observable side effects; clean module decoupling via events.
- Harder: requires a durable worker, a dispatcher, and idempotent consumers; synchronous
  invariants must still be enforced synchronously, not hidden behind events.
