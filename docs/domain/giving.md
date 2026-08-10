# Giving — contribution recording

## Problem
Churches (nonprofits) must record every gift — cash from the plate, checks (keyed or
scanner-imported), and payments that are NOT tax-deductible (book sales, trip fees,
event payments) — reconcile counting sessions, and produce year-end statements donors
can use for taxes. This module is **recording only**: money already received. Online
card/ACH giving is deliberately out of scope until the tokenized-processor
integration lands (ADR-006) — no card numbers, bank accounts, or processor tokens
exist anywhere in this schema.

## Scope
- **Funds** — designations with a `taxDeductible` flag. Non-deductible funds
  (Bookstore, Youth Trip) are recorded identically but excluded from tax statements.
  `taxDeductible` is immutable after creation: flipping it would rewrite the tax
  character of past gifts; archive + recreate instead. Funds archive, never delete.
- **Batches** — one counting session (Sunday offering, a scanner run) with an
  optional counted total (`expectedCents`) reconciled live against entered rows.
  Closing freezes the batch: no new entries, no deletions; reopening is allowed and
  audited.
- **Contributions** — amount (integer cents, never floats), method
  (CASH/CHECK/CARD/ACH/OTHER), optional check number, fund, optional person link,
  `donorName` for unlinked rows (loose cash, unmatched scanner rows), optional batch.
- **Check scanner support** — v1 is file-based: import any scanner-software or bank
  CSV export (recognized headers, any order: date, amount, fund, method,
  checkNumber, email, name, note; only date+amount required). Rows with an email
  matching a Person link automatically; check numbers imply CHECK; unknown funds and
  bad amounts/dates are per-line errors. Direct scanner-hardware drivers would need a
  processor/bank partnership — documented deferral.
- **Statements** — per person per year: itemized deductible gifts, totals by fund,
  and a separate informational non-deductible line that is never added to the
  deductible total. Includes the IRS "no goods or services" acknowledgment language.

## Data
`Fund`, `ContributionBatch` (status OPEN/CLOSED), `Contribution` — all
organizationId-scoped, tenant-guard registered. Money is integer cents everywhere;
`parseMoney`/`formatCents` are the only dollars-text conversions.

**Classification:** Confidential+ (BLUEPRINT §63) — the most sensitive data held.

## Permissions
`givingPermissions.can(role, action)` — `giving.view`, `giving.record`,
`giving.manage_funds`, `giving.statements`: OWNER/ADMIN only. CONTENT_MANAGER and
ANALYTICS_VIEWER get nothing, including aggregates (donor behavior leaks through
totals).

## Pure helpers (unit-tested)
`parseMoney`, `formatCents`, `batchTotals` (sum, by-method, reconciliation
difference), `buildAnnualStatement` (deductible-only totals), `mapContributionRows`
(scanner/bank CSV → validated rows with per-line errors).

## UI
`/giving` (YTD by fund, recent batches, new batch), `/giving/funds`,
`/giving/batches/[id]` (quick entry, scanner import, totals + reconciliation,
close/reopen), `/giving/statements` (print-clean). Nav + middleware gated.

## Audit
`giving.fund_created/archived/restored`, `giving.batch_created/closed/reopened`,
`giving.contribution_recorded/deleted`, `giving.contributions_imported` — all with
actor.

## Failure modes
Amounts validated as positive integer cents; entries into CLOSED batches refused;
deletes only while a batch is OPEN (closed rows are immutable history); unknown
funds/methods/dates surface per line on import, never silently dropped.

## Deferred (needs product/processor decisions)
Online giving (Stripe/processor per ADR-006 — tokenized, PCI stays with the
processor), recurring gifts, pledges/campaigns, refunds/voids (currently:
open-batch delete only), Gift Aid/multi-currency, direct scanner-hardware drivers.
