# People Import (CSV)

## Why
A church can't adopt the platform with an empty People list — every module (Groups,
Events, Messages, Journeys, Check-in) composes the Person primitive. Bulk CSV import is
the standard on-ramp from spreadsheets and other ChMS exports.

## Scope (v1)
- Paste-or-upload a CSV on `/people/import` (OWNER/ADMIN only).
- Fixed, documented header set — no interactive column-mapping UI yet:
  `firstName,lastName,email,phone,membershipStatus,tags,campus` (order-insensitive,
  extra columns ignored, headers case-insensitive). Only `firstName` and `lastName`
  are required per row.
- `membershipStatus` must be one of VISITOR|ATTENDER|MEMBER|INACTIVE (case-insensitive;
  blank → VISITOR). `tags` is `;`-separated. `campus` matches an existing campus by
  name (case-insensitive); an unknown campus name is a row error, not silent data loss.
- Dedupe: a row whose email matches an existing non-archived Person (case-insensitive,
  same org) is **skipped**, never merged — imports must be safe to re-run.
- Row-level errors (missing name, bad status, unknown campus, malformed row) are
  reported per line; valid rows still import. The import is **not** all-or-nothing:
  partial success with a precise error report beats forcing users to fix a 500-row
  file to perfection first.
- Every run records a `PersonImport` summary row (counts + errors JSON + actor) for
  auditability, plus a `people.imported` audit event.

## Deliberate decisions
- **Imported rows do NOT fire `PersonCreated` workflow triggers.** A 500-row import
  must not enqueue 500 automation runs (welcome emails to long-standing members would
  be actively harmful). The service uses a bulk insert path that bypasses
  `createPerson`'s outbox emit; this is documented here and in the service. If
  "run automations on import" is ever wanted, it becomes an explicit checkbox.
- **CSV parsing is hand-rolled** (RFC 4180 subset: quoted fields, escaped quotes,
  CRLF). Adding a parser dependency for ~60 lines would need an ADR (Constitution);
  the pure module is fully unit-tested instead.
- **No file storage.** The CSV is parsed in-request and discarded; only the summary
  persists. Files uploaded here are membership PII — not keeping the raw file is the
  privacy-preserving default (BLUEPRINT §63).
- Caps: 10,000 rows / 5 MB per import (one pastoral database at a time, not a data
  warehouse); larger files get a clear error telling the user to split them.

## Import wizard
The import UI is a one-question-per-screen wizard (Apple-setup style: single bold
question, fade transitions, progress bar): upload → optional AI consent → one
question per column ("What's in 'Full Name'?") plus conditional questions (name
order, tag delimiter, one per unrecognized status value, and a "How should
'Veteran' be displayed in your database?" screen for every column kept as a custom
field) → dry-run review → confirm → done. Columns can also map to **household**
(rows sharing a value are grouped into find-or-create-by-name Households) and
**custom** (any number of columns become PersonFieldDefinitions — reused by key on
re-import, with the existing definition's type always winning; select options are
derived from the file's own values, capped at MAX_SELECT_OPTIONS before degrading
to text). Custom-value coercion failures are per-line errors, same as an unknown
campus. Pre-selected answers come from `guessMappingColumns` (local header-alias
heuristics — no AI) or, only when the user explicitly chooses "Use AI suggestions"
on the consent screen, from Claude. The client only assembles answers into a
MappingPlan; the server re-validates it and runs the same deterministic pipeline in
`dryRunImportAction` (no writes) and `runImportAction` (writes, after confirm).

### Suggested-field catalog (backend-only)
`people/suggested-fields.ts` holds a curated catalog of the 200 fields churches
most commonly track (identity, contact/address, membership, milestones,
safety/compliance, health & care, volunteering, communication preferences,
family/household, life stage, ministries), each with a stable key, display label,
storage type, and normalized header aliases. It is never rendered as a browsable
list — it exists so the system anticipates incoming data: `guessMappingColumns`
pre-proposes recognized headers ("DOB", "Baptism Date", "Background Check") as
typed custom fields, and the AI mapper receives matches as hints so its proposals
converge on canonical labels/types. Deliberately excluded: financial amounts
(gifts, pledges, balances) — identity-like giving numbers only. Nothing is created
from the catalog until the user confirms its column in the wizard.

## AI-assisted mapping (ADR-011)
When the user opts in on the wizard's consent screen, Claude (`claude-opus-5`,
structured outputs) proposes a **MappingPlan**: column → field assignments
(including a `fullName` split), membershipStatus value translations
("Regular attender" → ATTENDER), and a tag delimiter. Declining (or a missing
`ANTHROPIC_API_KEY`, or any AI failure) falls back to the local heuristics — the
wizard works identically either way. Hard boundaries:

- **AI proposes, deterministic code disposes.** The model sees only per-column
  profiles — headers plus ≤8 distinct sample values with emails/phones masked
  (`maskImportValue`) — never full rows or the raw file. Its plan is validated
  (`validateMappingPlan`) against the file's real headers and applied
  (`applyMappingPlan`) by pure, unit-tested code feeding the same `mapImportRows` +
  `importPeople` pipeline as the exact-header path. The model cannot write anything.
- **Human review before any write (§66).** Every AI suggestion is walked through
  question-by-question in the wizard, then a dry-run review screen shows the plan
  recap, mapped-row preview, and valid/error counts; a separate confirm performs
  the import, re-validating the round-tripped plan server-side.
- **Opt-in only.** The AI is called exclusively after the user picks "Use AI
  suggestions" on the consent screen, which states exactly what is sent.
- Unmatched status values pass through and surface as per-line row errors — the
  system never guesses silently.
- Audit metadata on AI-assisted runs records `aiAssisted: true`, the model id, and
  the plan summary (ADR-007 provenance).
- Feature-gated on `ANTHROPIC_API_KEY`; without it the page shows only the
  exact-header flow.

## Data model
`PersonImport` — `organizationId`, `fileName?`, `totalRows`, `createdCount`,
`skippedCount`, `errorCount`, `errors Json` (array of `{line, message}`, capped at 100
entries), `createdByUserId?`, `createdAt`. Tenant-scoped, registered in
`TENANT_SCOPED_MODELS`. Additive migration only.

## Authorization
New `people.import` action in the people matrix: OWNER and ADMIN only (same tier as
`person.manage`; CONTENT_MANAGER/ANALYTICS_VIEWER get nothing). Enforced server-side
in the server action; negative tests included.

## Surfaces
- `/people/import` — upload/paste form, results panel (created/skipped/errors with
  line numbers), import history list (latest 10 runs).
- People list page gains an "Import CSV" button next to "Add person".

## Verification
- Unit: CSV parser (quotes, CRLF, ragged rows), row mapper (status/tags/campus
  resolution, required fields), permission matrix positive + negative.
- Live smoke: import a small CSV against dev Postgres — created/skipped/error counts,
  dedupe on re-run (all skipped), PersonImport row recorded.
