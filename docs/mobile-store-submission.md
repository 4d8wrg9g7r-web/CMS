# Store Submission Runbook — Container & White-Label Church Apps

How to take `apps/mobile` from the repo to the App Store and Google Play: once
for the **container app** ("Church Connect"), and repeatably for each
**white-label church app**. Written against Expo SDK 57 / EAS as of Aug 2026 —
store consoles change their screens regularly, but the shape of every step here
is stable. Steps marked **[YOU]** need accounts or approvals only a human can
provide; everything else is scriptable.

---

## 1. The two products (one codebase)

| | Container | White-label |
|---|---|---|
| Store listing | Ours: "Church Connect" | The church's: their name, their icon |
| Developer account | Ours | **The church's own** (App Store guideline 4.2.6) |
| Build command | `eas build` | `APP_VARIANT=whitelabel CHURCH_APP_ID=… eas build` |
| Church picker | Yes (directory) | No — pinned to one church |
| When to use | Free/base tier, demos, small churches | Premium tier |

Ship the container first. It exercises the entire pipeline with only our own
accounts at stake, and every white-label submission after it reuses the same
credentials plumbing.

## 2. Accounts and costs **[YOU]**

| Account | Cost | Lead time | Notes |
|---|---|---|---|
| Expo (expo.dev) | Free tier fine to start; paid for build concurrency | minutes | One org account owns all EAS projects, container and white-label alike |
| Apple Developer Program (ours) | $99/yr | 1–3 days (individual) / 1–2 wks (org) | Org enrollment needs a **D-U-N-S number** — free, 1–2 weeks if the entity doesn't have one |
| Apple fee waiver (churches) | $0 | days–weeks | Apple waives the fee for verified nonprofits in supported countries; requested **after** starting enrollment. US churches with a 501(c)(3) letter qualify |
| Google Play Console (ours) | $25 one-time | 1–2 days | Org account; identity verification required |
| Google Play (per church) | $25 one-time | 1–2 days | Each white-label church needs its own Play developer account too — same seller-of-record logic as Apple |

Practical note: Apple **organization** enrollment (not individual) is required
to have the church's legal name as the seller. Start each church's D-U-N-S +
enrollment the day they sign up for white-label — it's the long pole.

## 3. One-time workspace setup

```sh
npm i -g eas-cli
cd apps/mobile
eas login                        # [YOU] Expo credentials
eas init                         # links the repo to an EAS project (writes extra.eas.projectId)
```

Commit the `projectId` that `eas init` writes into the config — the app's push
registration reads it (`src/push.ts`).

Create `apps/mobile/eas.json` when first prompted; the profiles that matter:

```jsonc
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview":     { "distribution": "internal" },
    "production":  { "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

### Push credentials

- **iOS/APNs**: nothing manual — EAS generates and manages the APNs key during
  the first `eas build -p ios` credential prompts. Say yes to letting EAS manage.
- **Android/FCM**: create a Firebase project → add an Android app with the
  build's package name → download `google-services.json` → attach via
  `eas credentials -p android` (upload FCM v1 service-account key). **[YOU]**
  for the Firebase project creation; one Firebase project can serve the
  container, but each white-label package name needs its own Firebase app entry.
- The server side needs nothing new: Expo's push API takes tokens without keys.

### First device test (before any store)

```sh
eas build --profile development --platform ios   # or android
```

Install on a physical phone, sign in as a member, enable 🔔 Notify me, post an
announcement from /community, and watch the lock screen. This is the end-to-end
push test the CI environment can't do.

## 4. Branding assets checklist

Per app (container once; each white-label church supplies theirs — collect at
intake, §7):

| Asset | Spec | Notes |
|---|---|---|
| App icon | 1024×1024 PNG, no alpha, no rounded corners | Apple rejects alpha channels |
| Android adaptive icon | 432×432 foreground on transparent + background color | Keep logo inside the middle 66% safe zone |
| Splash | logo on solid color | Use the church's `themeColor` |
| iPhone screenshots | 6.7" (1290×2796) required; 5.5" optional | Screenshot the real app: home feed, events, sermons, custom page |
| Play screenshots | ≥2, 16:9 or 9:16 | Same set works |
| Feature graphic (Play) | 1024×500 | Church name + tagline on brand color |
| Privacy policy URL | public webpage | Required by both stores. One policy on the marketing site, parameterized per church, is fine |

Wire them in `app.config.ts` (white-label reads per-church paths from env or a
per-church assets folder — extend the config when the first real church ships).

## 5. Container app: first submission

### iOS

1. `eas build --platform ios --profile production` — first run walks through
   **[YOU]** Apple sign-in and creates certs/profiles/App Store Connect app.
2. `eas submit -p ios --latest` → build lands in **TestFlight**.
3. Test on TestFlight (§3's checklist again, on the store-signed build).
4. In App Store Connect **[YOU]**: metadata (name, subtitle, description,
   keywords, screenshots, privacy policy URL), **App Privacy** questionnaire —
   we collect: email (account), user content (posts/photos), coarse nothing;
   no tracking, no ads.
5. **App Review notes — critical for our sign-in flow.** Reviewers must be able
   to sign in. Provide: a demo church published in the directory (use a
   dedicated "Demo Community Church" org, not a real congregation), and a demo
   member whose email inbox the review team can't access — so instead state:
   *"Sign-in codes are emailed. For review, use demo@…; the code for this
   account is `<your REVIEW_DEMO_CODE>`"*.

   **Implemented** (`isReviewLogin` in `app-member-service.ts`): set
   `REVIEW_DEMO_EMAIL` + `REVIEW_DEMO_CODE` on the deployment and
   `verifyLoginCode` accepts that static code **for that email only**.
   Containment: off unless both vars are set; codes under 8 characters are
   refused; the email must match an existing Person in the org being signed
   into (create the demo member **only** in the demo church — every other
   church is unaffected); the resulting session is an ordinary member session.
   Setup: create the demo org + demo member (with the review email), set the
   two env vars, redeploy, and put the email + code in the review notes.
   A reviewer who can't sign in files a 2.1 rejection.
6. Submit for review. Typical turnaround: 1–3 days.

### Android

1. `eas build --platform android --profile production` (AAB).
2. `eas submit -p android --latest` (first time: **[YOU]** create the app in
   Play Console and a service-account JSON for EAS).
3. Play requires a staged rollout path: internal testing → closed → production.
   Google's first review of a new developer account can take up to a week and
   may require 12+ testers for 14 days on *personal* accounts — org accounts
   are exempt from the 12-tester rule.
4. Data safety form: same answers as Apple's privacy questionnaire.

## 6. Releases and updates

- **JS-only changes** (screens, renderers, contract-compatible features):
  `eas update` pushes over-the-air to installed apps — minutes, no review.
  Because the app is a thin client, *most* CMS feature work never needs a store
  release at all: new content types arrive via the API.
- **Native changes** (new Expo modules, SDK upgrades, icon/splash): new
  `eas build` + `eas submit` + review, both stores, container **and** every
  white-label app. Batch native changes; ship them rarely.
- Keep `src/contract.ts` additive-only — an old installed binary must always
  be able to read a new API response.

## 7. White-label pipeline (per church)

### Intake — collect once per church **[YOU]**

- [ ] Legal entity name + D-U-N-S (start lookup/request immediately)
- [ ] 501(c)(3) or local equivalent (for the fee waiver)
- [ ] App name (≤30 chars — App Studio already enforces this), subtitle, description
- [ ] Icon 1024×1024 + adaptive icon art (or approval for us to derive from their logo)
- [ ] Screenshots (we generate from their live app)
- [ ] Privacy policy URL (offer our parameterized template)
- [ ] `publicAppId` from App Studio (app must be **published** and polished — the store build is a window onto it)
- [ ] Contact email for both store accounts

### Church-side accounts **[YOU + church]**

1. Church enrolls in the Apple Developer Program as an **organization**
   (their D-U-N-S, their legal name), then requests the nonprofit fee waiver.
2. Church creates a Google Play developer org account ($25).
3. Church grants us access — either invite our account with the **App Manager**
   role, or (better, scriptable) create an **App Store Connect API key**
   (Team Key, App Manager) and share it; Play: invite as admin or share a
   service-account. Store per-church keys in the credentials vault, never in
   the repo.

### Build + submit

```sh
APP_VARIANT=whitelabel \
CHURCH_APP_ID=<publicAppId> \
CHURCH_APP_NAME="First Baptist Anytown" \
CHURCH_APP_SLUG=first-baptist-anytown \
eas build --platform all --profile production

eas submit -p ios --latest    # against the CHURCH's App Store Connect (their API key)
eas submit -p android --latest
```

Each white-label app is a distinct EAS project/app entry (distinct slug →
distinct bundle id `nu.victorychurch.cms.<slug>`); add a Firebase Android app
entry for its package name (§3).

### Review-proofing white-label apps

- **4.2.6 (template apps)**: satisfied by submitting under the church's own
  account with the church as seller of record. Never submit a church's app
  from our account.
- **4.3 (spam/duplication)**: the app must visibly be *that church's* — their
  icon, name, screenshots of their real content, their custom pages. Apps
  submitted with empty feeds, no sermons, and default assets are the ones that
  get flagged. Gate white-label submission on a content checklist: ≥1 custom
  page, real events, sermon library populated, feed active.
- **Review sign-in**: same `REVIEW_DEMO_EMAIL`/`REVIEW_DEMO_CODE` mechanism
  (§5.5) with a demo member inside the church's own org (they'll see their
  real app, which is the point).
- Expect the church's first submission to take the longest (new developer
  account + new app). Set expectations at intake: **4–6 weeks** from signed
  agreement to live on both stores, dominated by D-U-N-S + enrollment + waiver,
  not by us.

## 8. Rejection playbook

| Rejection | Cause | Fix |
|---|---|---|
| 2.1 App Completeness | Reviewer couldn't sign in / saw errors | Review-mode demo code (§5.5); test the exact store build on TestFlight first |
| 4.2 Minimum Functionality | App looks like a website wrapper | Point to native feed, push, offline-tolerant tabs in review notes; ensure the demo church's content is rich |
| 4.2.6 Template | Submitted from the wrong account | Resubmit under the church's account — no argument wins this one |
| 4.3 Spam | Looks identical to another church's app | Differentiate assets + content (checklist above), reply citing distinct org, content, and seller |
| 5.1.1 Data Collection | Privacy questionnaire mismatch | Align App Privacy answers with reality: email + user content, no tracking |
| Play: broken functionality | Push untested on the store build | Always run the §3 device checklist on the AAB via internal testing first |

Rejections are conversations: fix, reply in Resolution Center, resubmit —
subsequent reviews are usually faster.

## 9. Status tracker (copy per church)

```
Church: ______________  publicAppId: ______________
[ ] Intake complete           [ ] D-U-N-S obtained
[ ] Apple enrollment started  [ ] Fee waiver granted
[ ] Play account created      [ ] Access keys shared
[ ] Firebase app added        [ ] Assets in repo/vault
[ ] Content checklist passed  [ ] Dev build tested on device
[ ] iOS submitted             [ ] iOS approved
[ ] Play internal testing     [ ] Play production
[ ] Post-launch: QR/links swapped to store badges in App Studio
```

---

*Before the first real submission, build the one missing code piece flagged in
§5.5: the review-mode demo code (`REVIEW_DEMO_EMAIL`/`REVIEW_DEMO_CODE`
env-gated bypass in `verifyLoginCode`, restricted to that single email). It is
deliberately not in the codebase yet so the credential pair gets chosen when
the demo org exists.*
