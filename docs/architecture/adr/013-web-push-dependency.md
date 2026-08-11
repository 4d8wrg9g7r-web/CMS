# ADR-013: `web-push` dependency for church-app notifications

**Status:** Accepted
**Date:** 2026-08-11
**Deciders:** Founding engineering

## Context
The church app's community feed needs lock-screen notifications ("your church
posted an announcement"). Installed PWAs receive real Web Push on Android and on
iOS 16.4+; the same subscription data later serves the native container app.
Sending Web Push requires VAPID JWTs (ES256) plus RFC 8291 payload encryption
(ECDH over P-256, HKDF, AES-128-GCM) — hand-rolling that is several hundred
lines of security-critical crypto whose interoperability with FCM/APNs push
services cannot be verified from this environment.

## Decision
Add `web-push` (^3.6, MPL-2.0, the reference Node implementation maintained by
the Web Push ecosystem) plus `@types/web-push` as a devDependency, in the
dashboard app only. Usage is confined to one module (`lib/app-push.ts`):
announcement fan-out to stored member subscriptions, gated on
`WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` /
`WEB_PUSH_VAPID_SUBJECT` env vars (no keys → silent no-op). Keys are generated
once per deployment with `npx web-push generate-vapid-keys`.

## Consequences
- Interop with browser push services comes from the ecosystem's reference
  library instead of unverifiable in-house crypto.
- One new runtime dependency in the dashboard app; the data layer stays
  dependency-free (subscription storage is a plain service).
- Dead subscriptions (404/410 from the push service) are pruned on send, so
  the table self-cleans.
