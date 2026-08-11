# @cms/mobile — the native church app (container + white-label)

The Expo app behind Phase 2/3 of the church-app roadmap (docs/domain/app.md).
It is a **thin renderer over the CMS content API** (`/api/app/v1/*`): church
directory → per-church payload (manifest + content + feed). Everything a church
designs in App Studio — theme, 5-tab bottom bar, custom pages with linked
graphics, livestream — renders here with native link semantics:

| Link target | Web PWA | This app |
|---|---|---|
| App tab | tab link | switches the bottom bar |
| Open in app | same tab | in-app browser (SFSafariViewController / Custom Tabs) |
| External | new tab | system browser |

## Variants (one codebase)

- **Container** (default): "Church Connect" — find your church, open its app.
  Selection persists; a Switch button returns to the directory.
- **White-label**: one church, their name and icon, no picker:

```sh
APP_VARIANT=whitelabel CHURCH_APP_ID=<publicAppId> \
CHURCH_APP_NAME="First Baptist Anytown" CHURCH_APP_SLUG=first-baptist \
npx expo start
```

White-label store submissions go through the church's own Apple Developer
account (guideline 4.2.6; nonprofit fee waiver applies) with per-church icons
and store metadata supplied at build time.

## Develop

```sh
pnpm install                       # repo root (workspace)
cd apps/mobile
npx expo start                     # QR code → Expo Go on your phone
EXPO_PUBLIC_API_BASE=http://<your-lan-ip>:3000 npx expo start   # against local CMS
```

## Build & ship (EAS)

```sh
npx eas init                       # once, links the Expo project
npx eas build --platform all       # container build
APP_VARIANT=whitelabel CHURCH_APP_ID=... npx eas build          # white-label build
npx eas submit                     # store submission
```

## Deliberately not here yet

- Store assets (icons/splash are Expo defaults until branding pass)
- Remote push requires a physical device; in Expo Go remote push support
  varies by SDK — a development build (`eas build --profile development`) is
  the reliable way to test the "Notify me" flow end to end

Contract types live in `src/contract.ts` and mirror the API additively — the
server never breaks them; never widen them here.
