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
- Caps: 2,000 rows / 1 MB per import (one pastoral database at a time, not a data
  warehouse); larger files get a clear error telling the user to split them.

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
