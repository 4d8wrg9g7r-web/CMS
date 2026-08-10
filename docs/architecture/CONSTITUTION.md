# Engineering Constitution

> The condensed, enforceable invariants for this codebase. **Read this before planning or
> modifying architecture.** The full context lives in [`BLUEPRINT.md`](./BLUEPRINT.md);
> this file is the short version that governs day-to-day implementation.
>
> These are invariants. They change only through an
> [Architecture Decision Record](./adr/) — never silently in a feature PR.

## Prime directive

Build **one coherent platform**, not a collection of loosely connected apps. Every feature
composes shared primitives: **Person, Household, Organization, Campus, Event, Form, Task,
File, Message, Workflow, Ledger Entry, Permission, Audit Event.**

Before approving any new module, ask: *"If we removed the UI label, is the underlying
capability already a platform primitive?"* If yes, compose it. If no, define a genuinely
new domain concept with clear ownership and boundaries.

## Non-negotiable principles

1. **One Person model.** Giving, Groups, HR, Check-In, Communications, and Services
   reference the same `Person`. No product-specific people records.
2. **Multi-tenant from day one.** Every tenant-scoped record is explicitly owned by an
   `Organization` (and, when relevant, a `Campus`/`Ministry`).
3. **Modular monolith first.** Hard module boundaries; no premature microservices, no
   free-for-all monolith.
4. **Permissions are a platform primitive.** Authorization is enforced at the
   service/repository layer — never only in the UI.
5. **Auditability is mandatory for sensitive actions.** Finance, HR, child safety, exports,
   permission changes, and pastoral-care access require durable audit records.
6. **Workflows compose shared primitives.** Modules trigger the shared workflow engine;
   they do not each invent their own automation.
7. **External providers handle regulated infrastructure.** Payments, background checks,
   email/SMS delivery are integrated, not reinvented.
8. **AI never bypasses permissions.** AI access is permission-aware, logged, grounded in
   authorized records, and separated from high-risk automated decisions.
9. **Public API and webhooks are designed early.** Migration and integration are product
   capabilities, not post-launch cleanup.
10. **Reliability follows ministry criticality.** Sunday check-in, giving, auth, and
    service planning have stricter operating requirements than editorial features
    (see [reliability tiers](./BLUEPRINT.md#50-reliability-tiers)).

## The twelve "do nots" (§56)

1. **Do not** create a new representation of Person, Organization, Campus, Event, Task,
   Form, File, Workflow, Message, Permission, or Ledger Entry when an existing primitive
   can satisfy the requirement.
2. **Do not** access another module's database tables directly. Use its public application
   interface or published event contract.
3. **Do not** introduce a new infrastructure dependency, cloud service, queue, database, or
   framework without an [ADR](./adr/).
4. **Do not** weaken tenant scoping, authorization, audit logging, validation, or
   encryption to simplify implementation.
5. **Do not** perform external network side effects inside a database transaction. Use the
   outbox + durable worker pattern.
6. **Do not** store secrets or regulated credentials in application tables/logs unless the
   architecture explicitly requires and protects them.
7. **Do not** let UI components own business rules that API/mobile/automation clients also
   need.
8. **Do not** give AI direct database access. AI must use permission-aware application
   tools.
9. **Do not** modify immutable financial or audit facts in place; use
   corrective/compensating records.
10. **Do not** silently invent product behavior when a domain rule is unspecified. Preserve
    the current invariant, record the ambiguity in the implementation summary, and choose
    the safest reversible behavior.
11. **Do not** create customer-specific code branches. Model tenant variation as
    configuration, templates, permissions, or extensions.
12. **Do not** merge code without tests for new domain rules, authorization boundaries, and
    failure cases.

## Layering (§35)

```
UI / Route Handler → Application Command/Query → Authorization + Validation
  → Domain Service → Repository (tenant-scoped) → PostgreSQL
  → Domain Events → Outbox → Worker / Integrations
```

- Route handlers stay thin: parse, resolve principal, invoke service, serialize.
- Business rules never live in React components, DB triggers, or provider adapters.
- Repositories always operate within tenant scope.
- Commands are explicit verbs (`CreatePerson`, `RefundGift`, `ApprovePTO`). Queries return
  purpose-built read models, not leaked entities.
- External effects go through the outbox, never inside an open transaction.

## Tenant isolation (§32)

- Every tenant-owned table carries `organization_id` directly or through a rigorously
  enforced parent. **Default deny** on unscoped queries.
- Server resolves org/campus scope from authenticated membership. **Never** trust a tenant
  ID supplied by a client.
- Jobs, files, cache keys, and analytics are all tenant-aware.

## Authorization (§34)

Every command/query that returns or mutates protected data enforces
`can(user, action, resource, context)` **server-side**. Hiding a button is not a security
control. Sensitive domains — Children, Giving, HR, Pastoral Care, Background Checks,
Platform Security — default to strict need-to-know.

## Money & audit (§36–§37, §47)

- Money uses decimal/integer minor units — **never** floating point.
- Financial ledger entries and audit events are **append-only**; corrections are new
  records, not in-place edits.
- Do not store raw card numbers, CVV, or bank credentials — use tokenized, processor-hosted
  components and store only references.

## Definition of Done

A feature is not done because the UI works. See
[`DEFINITION_OF_DONE.md`](./DEFINITION_OF_DONE.md) — tenant scope, permission matrix
(with negative tests), audit, safe migrations, idempotent async effects, and observability
are all required before "production-ready."

## When in doubt

- Reuse a primitive before inventing one.
- Enforce the invariant synchronously; make side effects async and idempotent.
- Choose the safest reversible behavior and **write the ambiguity down** in your summary.
- Anything touching auth, tenancy, finance, HR, child safety, or pastoral care requires
  [human review](./BLUEPRINT.md#66-human-review-required).
