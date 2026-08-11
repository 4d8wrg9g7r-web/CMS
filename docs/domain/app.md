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

**Deferred:** photo posts, reactions beyond ❤, threaded replies, member
profiles, push notifications on new posts (Phase 2), rate limiting beyond
attempt caps, blocked-words filters.
