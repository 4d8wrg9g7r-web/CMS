# ADR-011: AI-assisted import mapping (Claude API)

**Status:** Accepted
**Date:** 2026-08-10
**Deciders:** Founding engineering

## Context
The CSV people import (docs/domain/people-import.md) requires exact canonical headers.
Real exports from other ChMS products arrive with arbitrary headers ("Full Name",
"Mobile", "Site") and value vocabularies ("Regular attender"). An interactive mapping
UI is heavy to build and still pushes translation work onto the user. ADR-007 already
defines how AI features must behave: narrowly scoped, permission-aware, never direct
data access, human approval for sensitive mutations (BLUEPRINT §61/§66).

## Decision
Add `@anthropic-ai/sdk` (the platform's first AI dependency) and an **AI proposes /
deterministic code disposes** import flow:

1. **Profiles, not rows, enter the prompt.** Pure code builds per-column profiles —
   header, up to 8 distinct sample values, counts — with emails and phone-shaped
   values masked before anything leaves the process (`maskImportValue`). Full rows and
   the raw file are never sent; campus names (org config, not member PII) are included
   so campus columns can be recognized.
2. **Claude returns a structured MappingPlan** (column → canonical-field map, status
   value translations, tag delimiter, human-readable summary) via structured outputs
   (`output_config.format` json_schema, model `claude-opus-5`). The plan is data, not
   action.
3. **Deterministic validation + dry run.** `validateMappingPlan` structurally validates
   the untrusted plan against the file's real headers (unknown targets/headers,
   duplicates, name coverage, invalid statuses all rejected); `applyMappingPlan`
   rewrites the CSV into the canonical shape; the existing unit-tested row mapper and
   tenant-scoped import service do everything else. The model has no tool access and
   no database access.
4. **Human review is mandatory (§66).** The plan, its summary, status translations,
   a mapped-row preview, and the dry-run valid/error counts render for OWNER/ADMIN
   review; only an explicit confirm submit imports, re-validating the round-tripped
   plan server-side. Audit metadata records `aiAssisted`, model id, and plan summary
   (ADR-007 provenance).
5. **Graceful absence.** The feature is invisible without `ANTHROPIC_API_KEY`; the
   exact-header path is unchanged and remains the default.

## Alternatives considered
- **Interactive column-mapping UI only** — more build effort, no value translation,
  user still does the tedious part. May still be added later; the plan format would
  back it directly.
- **Let the model rewrite the CSV** — output would be unauditable row-by-row and could
  hallucinate data. Rejected: the model may only choose from closed vocabularies
  (targets, statuses, delimiters); every cell that reaches the database comes from the
  user's file via deterministic transforms.
- **Send raw sample rows** — better recognition of ambiguous columns, but member
  emails/phones would transit the API. Rejected as default; masking costs little
  accuracy since shape survives masking.

## Consequences
- Easier: messy real-world imports work on first try; the pattern (profile → structured
  proposal → deterministic validation → human confirm) is the template for future AI
  features.
- Harder: an external service dependency (fails soft to the exact-header path); a
  second import code path to keep in sync (mitigated: both share `mapImportRows` and
  `importPeople`); API spend (~one small call per import, fractions of a cent).
