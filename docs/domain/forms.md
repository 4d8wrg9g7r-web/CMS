# Forms

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational)

Implements [BLUEPRINT §7 (Forms)](../architecture/BLUEPRINT.md#7-forms) — a church-aware
form builder that turns public submissions into structured actions. The Foundation
checklist calls for **versioned form definitions and submissions "before many modules
create bespoke intake forms"**, so this is deliberately built as a shared primitive.
Forms is the third module to compose `Person`: a submission can **match or create** a
Person ([docs/domain/people.md](./people.md)).

## Problem
Churches collect information constantly — connect cards, RSVPs, interest forms. They need
one builder that produces a public/embeddable form, captures submissions, and routes them
into People, instead of a new bespoke intake form per feature. Success = staff build a
form, share its public link, and see submissions that match existing People or create new
ones — and a form can change over time without corrupting old submissions.

## Actors
- **Owner / Admin** — build, publish, and view submissions.
- **Content Manager / Analytics Viewer / Prayer Moderator** — no access (submissions can
  contain Confidential Person data). Negative tests enforce this.
- **Public visitor** — submits a *published* form with no login, resolved by the form's
  `publicId` (the standard publicId bootstrapping boundary).

## Scope
- **Included (v1):** a field builder (short/long text, email, phone, number, date,
  dropdown, checkbox; each with required flag, help text, and an optional Person mapping);
  **versioned schemas** (each publish snapshots an immutable `FormVersion`); a public
  submission page with server-side validation and rate limiting; a confirmation message;
  match-or-create a Person from mapped fields; and a submissions inbox that renders each
  submission against the exact schema version it was answered with.
- **Explicitly excluded (non-goals, deferred):** conditional/branching fields, file
  uploads, signatures, payment fields, repeating fields, multi-page forms, approval
  chains, and form-triggered workflows/tasks (no workflow engine yet — those hooks land
  when it does). Field validation is limited to required + type/coercion + dropdown
  membership in v1.

## Data
New tenant-scoped models (carry `organizationId`; registered in the tenant guard):

- **FormDefinition** — `organizationId`, `title`, `description?`, `publicId` (unique,
  public URL key), `status` (`DRAFT|PUBLISHED|CLOSED`), `draftSchema` (Json — the working
  field list), `publishedVersion?` (the live `FormVersion.version`), `confirmationMessage`,
  `createPeople` (bool — match/create Person from submissions), `archivedAt?`, timestamps.
- **FormVersion** — `organizationId`, `formId`, `version` (int), `schema` (Json — an
  immutable snapshot). Unique `(formId, version)`. Submissions reference one of these, so a
  historical submission always renders against the schema it was actually answered with
  (the versioning invariant, BLUEPRINT §7).
- **FormSubmission** — `organizationId`, `formId`, `version` (which schema answered),
  `data` (Json — answers keyed by field id), `personId?` (matched/created),
  `submitterEmail?` / `submitterName?` (denormalized for the inbox), timestamp.

**Field schema** (validated by the pure `forms/schema.ts`, not a Prisma enum — genuinely
flexible data belongs in JSON, BLUEPRINT §36):
`{ id, label, type, required, options?, mapsTo?, helpText? }` where `mapsTo` ∈
`firstName|lastName|email|phone` drives Person matching.

**Classification:** submissions inherit field sensitivity; Person links are Confidential.
**Retention:** soft archival on the definition; submissions are retained.

## Permissions
`can(role, action)` matrix (pure, in `@cms/database` `formPermissions`, unit-tested):

| Action | OWNER | ADMIN | others |
| --- | --- | --- | --- |
| `form.view` | ✅ | ✅ | ❌ |
| `form.manage` | ✅ | ✅ | ❌ |

Enforced server-side via `requireForms`. Public submission is intentionally unauthenticated
but scoped to the form's `publicId` and rate-limited (BLUEPRINT §48).

## Commands
`createForm`, `updateFormSettings`, `saveDraftSchema`, `publishForm` (snapshots a new
`FormVersion`, bumps `publishedVersion`, sets status), `closeForm`, `archiveForm`/`restore`,
and `submitForm` (public: validates against the published schema, matches/creates a Person,
stores). Each staff mutation records an audit event; submissions are audited as
`form.submission_received`.

## Queries
`listForms`, `getForm`, `resolvePublicForm(publicId)` (published form + live schema, no
tenant context — bootstrapping via rawDb), `listSubmissions`, `getSubmission` (joined to
its `FormVersion` schema).

## Events
None in v1. `FormSubmitted` becomes a domain event once the outbox/workflow engine lands —
that is the hook for "start workflows, create tasks, register attendees."

## Workflows
None in v1 (see non-goals).

## UI states
Builder: empty schema, field rows, validation. Public form: not-found (bad/unpublished
id), closed, validation errors per field, success/confirmation. Inbox: empty, list,
per-submission detail.

## Failure modes
Invalid submissions are rejected field-by-field before storage. Submitting an
unpublished/closed form is refused. Person match/create failure never loses the raw
submission (the submission is stored first; person linkage is best-effort within the same
call and surfaced if it fails).

## Audit
`form.created`, `form.updated`, `form.published`, `form.closed`, `form.archived`,
`form.restored`, `form.submission_received` — actor (null for public submissions), target,
safe metadata.

## Tests
- **Unit (pure, `@cms/database`):** `validateSubmission` (required, type coercion for
  number/checkbox/date, dropdown-option membership, unknown-field rejection), `parseSchema`,
  `extractPersonInput`; the `can(role, action)` matrix (positive + **negative for every
  other role**); `Form*` registered as tenant-scoped.
- **Live smoke:** publish → submit → new version → old submission still renders against its
  original schema; match-or-create Person; cross-tenant isolation — verified against Postgres.

## Migration
Additive migration `add_forms` — new tables, FKs, indexes; no existing tables changed.

## Unresolved risks
- **Draft vs published divergence** — editing a published form mutates `draftSchema` only;
  changes go live to submitters only on re-publish (new version). This is intentional but
  means the builder must clearly show "unpublished changes."
- **Person match key** — v1 matches an existing Person by exact, case-insensitive email
  within the org; no fuzzy/duplicate resolution (that's the deferred People merge tooling).
