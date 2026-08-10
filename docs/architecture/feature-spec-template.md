# Feature Spec Template

> Copy this file to `docs/domain/<feature>.md` and fill in every section before
> implementation begins. Derived from [BLUEPRINT §58](./BLUEPRINT.md#58-required-feature-spec-template).
> The implementation sequence to follow is [BLUEPRINT §57](./BLUEPRINT.md#57-standard-feature-implementation-sequence).

---

## <Feature name>

**Status:** Draft | In review | Approved | Implemented
**Owner:**
**Reliability tier:** A (Sunday-critical) | B (financial) | C (operational) | D (editorial)

### Problem
The user problem and the measurable outcome that tells us it's solved.

### Actors
Roles/personas who use this feature and the scope they operate in.

### Scope
- **Included:** behavior this feature delivers.
- **Explicitly excluded (non-goals):** behavior intentionally left out.

### Data
Entities and fields introduced or touched, their tenant ownership, retention posture, and
[data classification](./BLUEPRINT.md#63-data-classification-rules). Note which existing
platform primitives are reused rather than re-created.

### Permissions
Action × role/scope matrix. Every protected action must be enforced server-side.

| Action | Role / scope | Allowed? | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

### Commands
State-changing operations (explicit verbs) and the invariants each must uphold.

### Queries
Read models returned and the filters/scoping applied.

### Events
Domain events published and consumed, with versioning notes.

### Workflows
Automation hooks (triggers/actions) and their idempotency strategy.

### UI states
Loading, empty, error, permission-denied, and success states.

### Failure modes
Provider errors, retries, duplicate delivery, offline behavior, and degradation strategy.

### Audit
Actions that require audit records and what metadata is captured (references, not sensitive
document contents).

### Tests
Unit, integration, authorization (positive + negative), E2E, and load (if Tier A/B).

### Migration
Backfill/import/upgrade plan and rollback/compensation strategy.

### Unresolved risks
Ambiguities preserved with the safest reversible behavior, plus open questions for review.
