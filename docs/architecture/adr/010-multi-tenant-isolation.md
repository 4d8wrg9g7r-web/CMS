# ADR-010: Multi-tenant isolation strategy

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
The platform is multi-tenant from day one. A single cross-tenant leak of giving, HR,
child-safety, or pastoral-care data would be catastrophic. Isolation cannot be an
afterthought or rely solely on UI/application-layer checks.

## Decision
**Every tenant-owned table carries `organization_id`** directly or inherits tenant
ownership through a rigorously enforced parent that cannot be crossed accidentally.
Repository/service APIs **default-deny** unscoped queries except explicitly platform-global
operations. The server resolves allowed organization/campus context from authenticated
membership and validates every requested scope — **tenant IDs are never trusted from
clients**. Defense in depth: application authorization plus DB constraints, and PostgreSQL
Row Level Security for the highest-risk datasets after careful testing. Background jobs,
file access, and cache keys are all tenant-aware. Cross-tenant operator analytics use a
separately governed pipeline that never exposes customer-identifiable data to other tenants.
Cross-tenant isolation has automated positive and negative tests as a merge gate.

## Alternatives considered
- **Database-per-tenant** — strong isolation but heavy operational cost and cross-tenant
  reporting friction at this stage. Deferred; may revisit for enterprise tiers via a new
  ADR.
- **Application-layer scoping only** — single-layer failure risk. Rejected as sole control.

## Consequences
- Easier: a uniform scoping model every module follows; testable isolation guarantees.
- Harder: discipline required so no query, job, file, or cache key ever escapes scope; RLS
  needs careful testing before use on high-risk tables.
