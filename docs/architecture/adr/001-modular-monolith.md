# ADR-001: Modular monolith before microservices

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
The platform spans many product families (People, Giving, Check-In, HR, Communications,
etc.). Splitting these into networked services early would multiply operational burden,
distributed-transaction complexity, and coupling before team size or scale justifies it.

## Decision
Ship the initial production architecture as a **modular monolith**: one primary
application/backend deployment with enforceable internal module boundaries. A module may
call another only through its published application/service interface or by consuming its
domain events — never by reaching into another module's tables or internal implementation.

## Alternatives considered
- **Microservices per product family** — premature; adds network, deployment, and
  consistency costs with no current scale justification.
- **Unstructured monolith** — fast initially, but invisible coupling accretes and Claude
  Code amplifies it. Rejected.

## Consequences
- Easier: local reasoning, transactions, refactoring, single deploy.
- Harder: boundaries must be enforced by discipline/tooling (architecture lint for
  cross-module imports), since the compiler won't force them.
- Extraction of a module (e.g. `worker`, `widget`) into its own deployable later becomes a
  file move, not a rewrite — provided the boundary rule held.
