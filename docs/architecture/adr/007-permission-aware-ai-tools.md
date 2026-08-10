# ADR-007: Permission-aware AI tool architecture

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
AI features (content discovery, natural-language reporting, drafting assistants) are
valuable but dangerous if given broad database access. A church platform holds giving,
HR, child-safety, and pastoral-care data that must never leak through prompts or bypass
authorization.

## Decision
AI operates through an **orchestrator that calls narrowly scoped, permission-aware tools**
(e.g. `SearchSermons`, `QueryAttendanceSummary`, `DraftWebsitePage`, `ListExpiringTraining`),
never direct/unrestricted SQL. Retrieval filters inaccessible records **before** content
reaches the model. Secrets, raw payment credentials, unnecessary HR documents, and
unrestricted pastoral notes never enter prompts. AI-initiated mutations use the same
command/service layer, validation, audit log, and approval policies as human actions;
destructive/sensitive actions may require explicit human approval. Capture model/provider/
version, tool calls, and record references for auditable AI mutations. Use a provider
abstraction so models can change without rewriting domain logic.

## Alternatives considered
- **"Chat with the whole database"** — bypasses authorization and leaks restricted data.
  Rejected (see BLUEPRINT §61).
- **Prompt-time redaction only** — insufficient; authorization must filter before
  retrieval, not after. Rejected as sole control.

## Consequences
- Easier: AI inherits the platform's existing authorization and audit guarantees.
- Harder: every AI capability needs a purpose-built, permission-checked tool; sensitive
  data requires deliberate isolation from any cross-platform semantic index.
