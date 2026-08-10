# Definition of Done

A module or feature is **not** done because working UI exists. Before a feature is treated
as production-ready, every applicable item below must be true. This is the merge gate
referenced in [`CONSTITUTION.md`](./CONSTITUTION.md) and
[BLUEPRINT §52/§60](./BLUEPRINT.md#52-testing-constitution).

## Checklist

- [ ] **Product acceptance criteria satisfied** — the feature does what its spec promised.
- [ ] **Tenant scope enforced and tested** — cross-tenant access is impossible and has
      negative tests proving it.
- [ ] **Permission matrix implemented with negative tests** — every action × role/scope
      combination is enforced server-side; unauthorized paths are tested and denied.
- [ ] **Audit requirements implemented** — sensitive actions produce append-only audit
      records with actor, tenant, action, resource, timestamp, and safe before/after
      metadata.
- [ ] **Migrations are safe and repeatable** — backward-safe for rolling deploys; tested on
      representative data.
- [ ] **No secrets/sensitive values leaked to logs** — logs redact secrets and highly
      restricted content.
- [ ] **Async effects are idempotent and observable** — outbox/worker handlers tolerate
      duplicate delivery and expose status/failures.
- [ ] **UI states exist** — loading, empty, error, permission-denied, and success are all
      handled.
- [ ] **Test coverage appropriate to risk tier** — unit/integration/authorization/E2E
      (and load, for Tier A/B) coverage exists.
- [ ] **Observability added for critical paths** — structured logs, metrics, and tracing
      with request/job/workflow and tenant correlation.
- [ ] **Documentation updated** — domain spec, changelog, and any affected docs reflect the
      change.
- [ ] **No duplicate platform primitive introduced** — existing Person/Event/Task/Form/
      File/Message/Workflow/Permission/Ledger primitives were reused where applicable.
- [ ] **Accessibility baseline verified** for customer-facing UI.

## Human review required

The following changes require human architecture/security review before merge
(see [BLUEPRINT §66](./BLUEPRINT.md#66-human-review-required)):

- Authentication, tenant isolation, authorization, encryption, secrets, audit
  architecture, or SSO.
- Giving/payment flows, refunds, statements, ledger/reconciliation, financial exports.
- HR compensation, tax/payroll documents, disciplinary/performance data.
- Child check-in/security, guardian authorization, background-check handling.
- Pastoral-care confidentiality and benevolence workflows.
- Large-scale data imports, destructive migrations, retention/delete operations, exports.
- AI features that can mutate records, communicate externally, or analyze highly
  restricted data.
