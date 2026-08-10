# ADR-002: Canonical Person and separate UserAccount

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
Ministry records (people the church relates to) and authentication identities (people who
log in) are different concepts with different lifecycles. Most people a church tracks never
log in; some logins map to staff, volunteers, or donors. Conflating them creates duplicate
records and authorization confusion.

## Decision
Model `Person` (a ministry record) separately from `UserAccount` (an authenticated
identity). A `UserAccount` links to at most one `Person`. Employment, volunteering, and
donor relationships are attributes/relationships on a `Person`, not new people records.
Use stable internal UUID/ULID identifiers; external provider IDs are aliases, never
canonical keys. Keep login email separate from Person contact email.

## Alternatives considered
- **Single `User` table for everyone** — forces logins for non-users and tangles auth with
  ministry data. Rejected.
- **Per-module people records** — violates the "one Person model" principle and fragments
  the relationship graph. Rejected.

## Consequences
- Easier: clean authorization, account linking/recovery without duplicating people,
  consistent relationship graph across modules.
- Harder: every module must resolve the Person↔UserAccount relationship correctly and not
  assume a Person has a login.
