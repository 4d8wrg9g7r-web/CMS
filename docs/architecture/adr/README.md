# Architecture Decision Records

Short records of decisions that future engineers (or Claude Code) might otherwise revisit
repeatedly. Each ADR states **Context, Decision, Alternatives Considered, Consequences,**
and **Status**.

Per the [Constitution](../CONSTITUTION.md), an invariant changes **only** through an ADR —
never silently in a feature PR. Introducing a new infrastructure dependency, cloud service,
queue, database, or framework requires a new ADR first.

## How to add an ADR

1. Copy [`000-template.md`](./000-template.md) to `NNN-short-title.md` (next number).
2. Fill in every section.
3. Set **Status** to `Proposed`; move to `Accepted` after review (or `Superseded by
   ADR-NNN` when replaced).

## Index

The foundational decisions from [BLUEPRINT §59](../BLUEPRINT.md#59-architecture-decision-records):

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-001](./001-modular-monolith.md) | Modular monolith before microservices | Accepted |
| [ADR-002](./002-person-vs-useraccount.md) | Canonical Person and separate UserAccount | Accepted |
| [ADR-003](./003-postgresql-system-of-record.md) | PostgreSQL as primary system of record | Accepted |
| [ADR-004](./004-outbox-for-side-effects.md) | Outbox for cross-module/external side effects | Accepted |
| [ADR-005](./005-shared-workflow-engine.md) | Shared workflow engine | Accepted |
| [ADR-006](./006-tokenized-payment-boundary.md) | Tokenized payment processor boundary | Accepted |
| [ADR-007](./007-permission-aware-ai-tools.md) | Permission-aware AI tool architecture | Accepted |
| [ADR-008](./008-object-storage-metadata-db.md) | S3-compatible object storage + metadata DB | Accepted |
| [ADR-009](./009-api-webhook-versioning.md) | API/webhook versioning strategy | Accepted |
| [ADR-010](./010-multi-tenant-isolation.md) | Multi-tenant isolation strategy | Accepted |
| [ADR-011](./011-ai-assisted-import-mapping.md) | AI-assisted import mapping (Claude API) | Accepted |
