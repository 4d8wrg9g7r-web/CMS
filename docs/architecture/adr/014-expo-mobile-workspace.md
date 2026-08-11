# ADR-014: Expo workspace for the native church app

**Status:** Accepted
**Date:** 2026-08-11
**Deciders:** Founding engineering

## Context
Phases 2–3 of the church-app roadmap (docs/domain/app.md) need native builds:
one container app in the stores plus white-label per-church builds. The web
surfaces already render everything from the keyless content API, so the native
app can be a thin client — but it needs a React Native toolchain, which is a
substantial dependency footprint the Constitution requires an ADR for.

## Decision
Add `apps/mobile` (`@cms/mobile`) as an Expo (SDK 57) workspace app:

- **Expo over bare React Native**: managed config, EAS build/submit for the
  per-church build automation Phase 3 requires, over-the-air JS updates later.
- **Dependencies** confined to the mobile workspace: `expo`, `react-native`,
  `expo-status-bar`, `expo-constants`, `@react-native-async-storage/async-storage`
  (persisted church selection), `expo-web-browser` (in-app browser link
  target), `react-native-webview` (livestream embeds). Versions pinned from
  Expo's bundledNativeModules table.
- **No workspace imports**: the app mirrors the API contract in
  `src/contract.ts` instead of importing `@cms/database` (which drags Prisma).
  The API is additive-only, so the mirror stays valid.
- **Variants via app.config.ts**: `APP_VARIANT=whitelabel` + `CHURCH_APP_ID`
  turns the container into a single-church build — one codebase for both
  products.

## Consequences
- CI verification here is typecheck + Metro bundle (`expo export`); device
  builds, simulators, and store submission happen through EAS outside this
  repo's test loop.
- The web dashboard build is untouched — mobile deps never enter its graph.
- Contract drift between server and mobile is a review-time concern; the
  additive-only rule on /api/app/v1 is what makes the mirror safe.
