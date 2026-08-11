# ADR-016: Text-to-give via Twilio inbound webhooks, TwiML replies, no SDK

**Status:** Accepted
**Date:** 2026-08-11
**Deciders:** Founding engineering

## Context
Members expect to text an amount to a church number and get a giving link
back (table stakes on Subsplash/Pushpay). SMS requires a telephony provider;
the question is how much of one we take on.

## Decision

**Inbound-only Twilio, answered with TwiML.** The church buys its own Twilio
number and points its incoming-message webhook at
`/api/giving/text/<publicAppId>`. Twilio POSTs the message; we validate the
`X-Twilio-Signature` (base64 HMAC-SHA1 of URL + sorted params, keyed by the
church's auth token — hand-rolled + unit-tested, same pattern as ADRs 013/015),
parse the text ("50", "$25.50", "give 100 missions"), match the sender's phone
to a Person, create a prefilled Stripe Checkout session, and reply with TwiML
XML in the webhook response. **The entire loop needs no outbound SMS API
call and no Twilio SDK** — replying to the webhook is the send.

Per-church credentials again: the auth token lives in `OnlineGivingConfig`
(write-only in the UI), so each church's messaging bill and number are its
own, and a signature from any other account is rejected.

The gift itself then flows through the existing checkout → webhook →
Contribution pipeline unchanged; the phone→Person match rides as `person_id`
metadata, so a texted gift lands on the right profile exactly like an in-app
gift.

## Consequences
- Churches do a one-time Twilio setup (number + webhook + auth token) —
  documented on /giving/online.
- No outbound notifications by SMS (receipts come from Stripe by email);
  adding outbound SMS later would mean Twilio REST calls with the same
  credentials, no schema change.
- Fund keywords resolve fuzzily (exact → prefix → substring → default fund);
  unmatched keywords still give to the default rather than failing the gift.
- Checkout links expire after 24h (Stripe default) — acceptable for a
  text-now-give-now flow.
