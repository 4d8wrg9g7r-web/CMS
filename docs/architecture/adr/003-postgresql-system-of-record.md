# ADR-003: PostgreSQL as primary system of record

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
The platform needs strong transactional guarantees, relational integrity, constraints for
critical invariants (tenancy, finance), and mature operational tooling. It also needs
flexibility for genuinely extensible data and, later, text/semantic search.

## Decision
Use **PostgreSQL** as the primary system of record. Use relational columns and foreign
keys for core domain relationships; reserve JSON for genuinely flexible data, not as an
escape hatch. Enforce important invariants with DB constraints in addition to application
validation. Money uses decimal/integer minor units; timestamps are timezone-aware. Start
search with Postgres text/trigram capabilities before adopting a dedicated engine.

## Alternatives considered
- **NoSQL document store as primary** — weaker cross-entity integrity and transactions for
  a highly relational domain. Rejected as system of record.
- **Dedicated search engine from day one** — premature infrastructure; Postgres suffices
  until scale/semantic needs justify it (see ADR to come if/when adopted).

## Consequences
- Easier: transactional outbox (ADR-004), constraints, migrations, and RLS options for
  high-risk tenant data.
- Harder: large historical tables (check-ins, audit, workflow runs) need partitioning/
  archive strategies designed before they become emergencies.
