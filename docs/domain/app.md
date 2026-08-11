# Church App (App Studio + public PWA)

The church designs a mobile app in **App Studio** (/app-studio) and publishes it as
an installable web app at **/a/&lt;publicAppId&gt;** — Phase 1 of the app roadmap. The
same manifest later drives a native container app (Phase 2) and white-label App
Store builds under each church's own Apple Developer account (Phase 3, per
guideline 4.2.6 — nonprofit fee waiver applies). Nothing in the manifest is
web-specific by design.

## Model
- `ChurchApp` — one per organization: `publicAppId` (public URL key, same
  bootstrapping boundary as forms/events publicIds), `enabled` (publish flag),
  `config` (validated manifest JSON).
- `Sermon` — the sermon library behind the Sermons tab: title, speaker, series,
  passage, description, external `videoUrl` (YouTube/Vimeo/podcast host — CMS
  hosts no media bytes), `preachedAt`, soft archival.

## Manifest (app/manifest.ts, pure)
`validateAppManifest` is the single gate for the untrusted designer JSON:
appName (≤30 chars — the App Store limit, enforced now so Phase 3 needs no
migration), themeColor (hex), logoUrl (uploaded to public storage), welcome
(≤300), optional givingUrl (http(s); shows the Give button), and 1–8 ordered
tabs — built-ins home/events/sermons/groups/forms (each once, home required)
plus custom link tabs (label ≤20, http(s)).

## One screen, two surfaces
`AppScreen` renders the phone UI from (manifest, content) — pure and
serializable. App Studio's live preview drives it client-side with draft state;
the public page server-renders it with the saved manifest. `buildAppContent`
assembles content identically for both: upcoming events (recurrence-expanded),
sermons, PUBLISHED groups, PUBLISHED forms (linking to /f/&lt;publicId&gt;). Only
already-public content — never person data.

## Public surface
/a/&lt;id&gt; resolves via rawDb by publicAppId (documented bootstrapping exception)
and 404s unless `enabled` and the stored manifest still validates. Per-church
`manifest.webmanifest` (name, theme_color, church icon, standalone display)
makes it installable on Android; iOS uses the apple-touch-icon/meta set from
page metadata. Install link + QR code (ADR-012: `qrcode` dep) live in App
Studio after publishing.

## Authorization
`app-permissions` matrix: OWNER/ADMIN/CONTENT_MANAGER manage app + sermons
(public-facing content, Events posture); ANALYTICS_VIEWER views. The public
surface bypasses the matrix by design.

## Audit
`app.updated`, `app.published`, `app.unpublished`, `sermon.created`,
`sermon.archived` with actor.

## Deferred
Push notifications (Phase 2 container app; ties into the Message outbox),
sermon audio/podcast feeds, media uploads, per-tab custom pages, native builds
+ store submission automation, service-worker offline caching.

## Container experience (directory)
The container-app model (one store app previewing every church — the Subsplash
shape) starts as a web twin: **/a** is "Find your church" — search over enabled
apps with `listedInDirectory` (default true; App Studio toggle; unlisting never
breaks direct links/QR codes). `searchDirectory` matches church OR app name at
the public boundary and skips invalid manifests. The **app content API**
(`/api/app/v1/directory?q=`, `/api/app/v1/apps/<publicAppId>`) serves the same
data as JSON — unauthenticated (public content only), cacheable, and the
contract the native container and white-label shells will consume as thin
renderers; changes must stay additive once native clients ship. Unlike
/api/v1/* this namespace is deliberately keyless.

## Community feed (dynamic home)
The Home tab is a live feed (Facebook shape): **CHURCH** posts are staff
announcements composed on /community (audited, CONTENT_MANAGER+); **MEMBER**
posts come from signed-in members. Visibility: signed-out → church-wide CHURCH
posts only; signed-in → plus church-wide MEMBER posts and posts scoped to
groups the viewer belongs to (composer offers Everyone / my groups; group
membership verified server-side). Likes and comments per post; bodies are
plain text (1000/300 chars), whitespace-collapsed, always rendered as text.
Posts (member and announcement) can carry one photo: uploaded through gated
actions (member session / app.manage) to PUBLIC storage, 4 MB, image types
only; a post needs text or a photo. The moderation table marks photo posts.
Moderation = `hiddenAt` (hide/restore on /community, audited; hidden posts
leave the feed but are kept). `manifest.allowMemberPosts` (default true)
switches the composer off without touching announcements.

**Member identity:** members ARE People — no separate accounts. Sign-in at
/a/&lt;id&gt;/signin: email → 6-digit code (hashed, 10-min TTL, 5 attempts, sent
through the message pipeline WITHOUT a person link so the marketing opt-out
never locks members out) → 90-day session (random token, hashed at rest,
httpOnly cookie scoped to /a/&lt;id&gt;). Responses never reveal whether an email
matched (no enumeration). App Studio previews the feed signed-out via the same
AppFeed component in previewMode; the keyless content API exposes only the
signed-out feed view.

**Deferred:** reactions beyond ❤, threaded replies, member
profiles, push notifications on new posts (Phase 2), rate limiting beyond
attempt caps, blocked-words filters.

## Profiles, reactions, replies, push (feed v3)
- **Profiles** (/a/&lt;id&gt;/profile/&lt;personId&gt;, members-only): photo, name,
  "part of &lt;church&gt; since", group chips, and the author's posts THE VIEWER may
  see (same feed visibility rules) — never contact info. `Person.photoUrl` is
  the member's self-service avatar (gated upload, public storage); avatars
  render across post/comment headers and author names link to profiles.
- **Reactions**: one per person per post from the ❤️🙏🙌🎉 whitelist (same emoji
  toggles off, different replaces; `AppPostLike.emoji`). The feed returns a
  per-emoji breakdown plus the viewer's own; likeCount/likedByMe remain for API
  compatibility.
- **Replies**: single-level threading (`AppPostComment.parentCommentId`; parent
  must be a top-level comment on the same post). Feed shows the latest 3
  top-level comments with up to 5 replies each.
- **Web push** (ADR-013): signed-in members opt in per device ("Notify me");
  subscriptions stored in `AppPushSubscription` (endpoint unique, pruned on
  404/410). Announcements fan out via after() using VAPID keys
  (`WEB_PUSH_VAPID_PUBLIC_KEY`/`_PRIVATE_KEY`/`_SUBJECT`, generated with
  `npx web-push generate-vapid-keys`); no keys → silent no-op and the toggle
  hides. public/sw.js shows the notification and opens /a/&lt;id&gt; on tap. Works
  on installed PWAs (Android; iOS 16.4+); the native container will reuse the
  same subscription data.

## Tabs v2: the 5-slot bottom bar + custom pages
The bottom bar holds at most **5 tabs**, chosen in App Studio from the catalog:
Home (required), Events, Media (sermons), Groups, Connect (forms), Give,
**Livestream** (`{url}` — YouTube/Vimeo URLs auto-convert to embedded players
via `toEmbedUrl`, anything else falls back to an open-in-browser button),
**custom pages** (`{pageId, label}`), and link tabs. Manifests stored before
the cap are CLAMPED to the first 5 at validation — never rejected — so no
published app breaks; each built-in appears once and Home is mandatory.

**Custom pages** (`AppPage`, soft-archived; blocks validated on save AND read):
church-designed screens built in /app-studio/pages from graphics (optionally
clickable), headings, text, buttons, dividers. Every link declares a target —
`tab` (switch to a bottom-bar tab; falls back to Home if that tab isn't among
the 5), `inapp` (web: same-tab; native later: in-app browser), `external`
(web: new tab; native: system browser). The distinction is data, not
presentation, so the native shells upgrade behavior without a migration.
`PageBlocksView` renders pages identically in the studio preview, the public
app, and (later) native. Content/API additively expose active pages. Audited:
`app.page_created/updated/archived`.

## Native container scaffold (apps/mobile, ADR-014)
`@cms/mobile` is the Expo app for Phases 2–3: a thin renderer over the keyless
content API (directory → per-church payload), mirroring the contract in
`src/contract.ts` (additive-only; no @cms/database import — Prisma stays out of
the bundle). Renders the manifest natively: themed header, 5-tab bottom bar,
events/media/groups/connect/give, livestream (WebView embed), custom pages —
where link targets get their native upgrade: `tab` switches the bar, `inapp`
opens expo-web-browser (SFSafariViewController / Custom Tabs), `external` opens
the system browser. Two products from one codebase via app.config.ts:
container ("Church Connect", persisted church picker + Switch) and white-label
(`APP_VARIANT=whitelabel CHURCH_APP_ID=…` pins one church, per-church
name/slug/bundle id — submitted under the church's own developer account).
Verified in CI as typecheck + Metro export; device builds go through EAS.
Deferred: member auth (token flow mirroring the email-code sign-in), native
push registration, store branding assets.

## Member auth API (native)
The native shells sign members in over JSON instead of cookies — same
credential (AppSession, hashed, 90-day), same email-code flow, same
no-enumeration posture. Under /api/app/v1/apps/&lt;id&gt;:
`POST auth/request-code {email}` (200 + identical body always; code through
the message pipeline, opt-out-proof), `POST auth/verify {email, code}` →
`{token, member}` (401 on bad/expired codes), `POST auth/signout` (revokes),
`GET me` → member + groups (401 without a live token). With
`Authorization: Bearer <token>`, `GET apps/<id>` personalizes: feed gains
member posts + the viewer's group posts, and `member`/`my_groups` appear
(response flips to no-store; anonymous responses stay cacheable with
`Vary: Authorization`). Member writes: `POST posts` (text + optional image_url), `POST photos`
(Bearer multipart, 4 MB, image types, public storage — the native composer's
attach flow), `POST posts/<id>/reaction` (whitelist),
`POST posts/<id>/comments` (+`parent_comment_id`). The Expo app stores the
token per church in AsyncStorage (src/auth.ts), clears it when the server
stops recognizing it, and drives SignInScreen + the interactive native feed
(composer with group audience, reaction picker, comments/replies).
