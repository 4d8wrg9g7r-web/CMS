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

---

# Online giving (v2)

Members give from the church app — PWA and native — through the church's OWN
Stripe account (ADR-015). The platform never holds money and never sees card
data (Stripe-hosted Checkout).

## Flow
1. Setup on `/giving/online` (giving.manage_funds): paste the church's Stripe
   secret key + webhook signing secret (write-only, masked on read), enable,
   and mark which funds appear in the app (`Fund.onlineEnabled`).
2. The app's Give tab becomes an amount picker (presets + custom, fund choice,
   one-time or monthly). Guests can give; signed-in members' `person_id` rides
   as metadata. Checkout happens on Stripe; success returns to a themed
   thank-you page.
3. Stripe calls `/api/giving/stripe/<publicAppId>` — verified with that
   church's signing secret (HMAC-SHA256, 5-minute replay window). One-time
   gifts record from `checkout.session.completed`; recurring gifts (first
   charge + renewals) from `invoice.paid` with metadata read off the
   subscription. Rows land in the same Contribution ledger as Sunday's count:
   method `ONLINE`, `externalId` = Stripe id (unique per org → idempotent
   under retries), donor linked by person metadata, then receipt-email match,
   then donor name. A deleted fund falls back to the first active fund —
   received money is never dropped.

## Invariants
- Stripe keys never serialize to any client (masked config only) and never
  appear in app payloads.
- The webhook rejects unsigned/foreign-signed/stale payloads before parsing.
- `ONLINE` is display-only in the dashboard — webhook-recorded, never a
  manual-entry option.

## Audit
`giving.online_config_updated` (flags only, never keys),
`giving.fund_online_enabled` / `giving.fund_online_disabled`.

## Giving experience v3 (Subsplash parity)

- **Flow**: amount-first (large editable amount), quick presets, frequency
  ladder One time / Weekly / Every 2 weeks / Monthly (`GIFT_INTERVALS` — each
  maps 1:1 to Stripe `recurring{interval, interval_count}`), fund, and
  **cover processing costs**: `grossUpCents` (2.9% + 30¢, ceil) charges the
  donor the grossed-up amount so the church nets the intended gift; the fee
  preview updates live in the UI (client mirrors the math — the pure module
  can't enter the bundle).
- **My giving (members)**: recent gifts of every method — Sunday checks
  included — plus active recurring schedules with confirm-then-cancel.
  `RecurringGift` mirrors Stripe subscriptions (upserted on `invoice.paid`
  with `gift_interval` metadata, one row per subscription, canceled by
  `customer.subscription.deleted` or in-app cancel: Stripe DELETE first, then
  the mirror — a failed Stripe call surfaces an error and never half-cancels).
  Ownership = the personId link; a member can only ever see/cancel their own.
  Surfaces: PWA Give tab and native (`GET give/mine`,
  `POST give/recurring/[id] {action:"cancel"}`).

## Bank (ACH) giving

Opt-in per church (`OnlineGivingConfig.achEnabled` — the church must enable
ACH Direct Debit on its Stripe account first). The give flow adds a
Card / Bank toggle; bank fees are 0.8% capped at $5 (`grossUpCentsForMethod`),
so fee-cover on large gifts costs dollars instead of tens of dollars.

**Async settlement is the critical invariant**: an ACH Checkout session
"completes" while the debit is still clearing, so
`checkout.session.completed` is only recorded when `payment_status` is
`"paid"` (card); the settled bank debit arrives days later as
`checkout.session.async_payment_succeeded` and records then — method `ACH`,
same idempotency key. A failed debit (`async_payment_failed`) records
nothing. Money appears in the ledger only when it has actually settled.
Recurring bank gifts need no special handling — `invoice.paid` already fires
on settlement.

## Text-to-give (ADR-016)

Members text an amount to the church's Twilio number; we answer the inbound
webhook (`/api/giving/text/<publicAppId>`, signature-verified with the
church's own auth token) with TwiML containing a prefilled Stripe Checkout
link — no outbound SMS API in the loop. `"50"` → default fund; `"50 Missions"`
→ fuzzy fund match (exact → prefix → substring → default); anything else →
help text. The sender's phone is matched to a Person (normalized last-10
digits) and rides as metadata, so the recorded gift lands on their profile
exactly like an in-app gift. Enable on /giving/online: toggle + Twilio auth
token (write-only) + the webhook URL to paste into Twilio.
