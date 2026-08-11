# ADR-015: Stripe online giving over plain REST, per-church accounts

**Status:** Accepted
**Date:** 2026-08-11
**Deciders:** Founding engineering

## Context
Churches want members to give from the church app (PWA + native). Two design
questions: (1) whose payment account holds the money, and (2) do we take the
`stripe` SDK as a dependency.

## Decision

**Per-church Stripe accounts, keys pasted into the dashboard.** Each church
creates its own Stripe account and pastes its secret key + webhook signing
secret into `/giving/online` (stored in `OnlineGivingConfig`, write-only in
the UI, masked on read). Gifts settle directly to the church's account; the
platform never holds or routes money, which keeps us out of money-transmitter
territory and makes each church's Stripe dashboard their source of truth for
payouts, refunds, and disputes. Stripe Connect (platform OAuth, application
fees) is the natural v2 when we want revenue share — the checkout/webhook code
is unchanged by that move, only key acquisition.

**No `stripe` npm dependency.** The two calls we need — create a Checkout
Session, read a subscription — are plain form-encoded HTTPS, and webhook
verification is a documented HMAC-SHA256 scheme. Both are hand-rolled
(`packages/database/src/giving/stripe.ts` pure + unit-tested;
`apps/dashboard/lib/stripe-checkout.ts` for the two fetches), the same call we
made hand-rolling SigV4 instead of taking the AWS SDK. Checkout means the card
form is Stripe-hosted — no card data ever touches our servers (SAQ-A).

**Recording model.** The webhook (`/api/giving/stripe/<publicAppId>`, verified
with that church's signing secret) records `Contribution` rows with method
`ONLINE` and `externalId` = payment_intent / invoice id, unique per org —
idempotent under Stripe's retries. One-time gifts record from
`checkout.session.completed` (mode=payment only); recurring gifts record from
`invoice.paid` (first charge and renewals), with fund/person read from
subscription metadata. Donors are linked by member `person_id` metadata when
signed in, else by receipt-email match, else kept as `donorName`.

## Consequences
- Each church does a one-time Stripe setup (account, key, webhook) — guided on
  the settings page; more setup friction than a Connect onboarding flow.
- Storing churches' secret keys makes the database a higher-value target;
  keys are never serialized to clients and never logged. At-rest encryption
  beyond Postgres/at-rest disk encryption is a follow-up if required.
- No platform fee is possible until the Connect v2.
- API-version drift risk is limited to the two endpoints we call; both are
  among Stripe's most stable.
