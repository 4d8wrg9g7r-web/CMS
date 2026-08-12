# Website builder

The church's public website, built from section blocks and served by the CMS
itself — the web counterpart to the church app (docs/domain/app.md). One `Site`
per organization, rendered at `/w/<publicSiteKey>`.

## Why a section builder

Churches shouldn't need a separate website vendor when the CMS already holds
their events, sermons, groups, and giving. A page is an ordered array of typed
section blocks (`SitePage.sections`, validated by
`packages/database/src/site/site-sections.ts`); **live** section kinds carry no
content of their own — the renderer pulls current CMS data at request time, so
the website can never drift out of date:

| Kind | Content |
|---|---|
| `hero` | headline, subheadline, optional background image, up to 3 CTA buttons |
| `serviceTimes` | renders the site config's service-times list |
| `textImage` | title + body (paragraph/bullet text), optional image left/right |
| `cardGrid` | up to 12 linkable cards (ministries, next steps…) |
| `events` | **live** — upcoming events via the recurrence expander |
| `sermons` | **live** — latest sermons from the media library |
| `groups` | **live** — published groups, linking to the `/g/` group finder |
| `give` | accent-colored giving banner linking to the church app's give flow |
| `cta` | centered call-to-action card with buttons |
| `team` | people with photos/roles |
| `visit` | address/contact/service-times block from site config |
| `markdown` | plain text (paragraphs + `- ` bullets; no raw HTML ever) |

`parseSections` coerces untrusted JSON on every read and write: unknown kinds
are dropped, field junk degrades to defaults, and nothing in a stored page can
crash the public site or inject markup.

## The Victory template

`victoryTemplate(churchName)` seeds a complete seven-page church site —
Home, Plan a Visit, About, Ministries, Events, Watch, Give — modeled on the
structure of victorychurch.nu. The first open of the Website studio calls
`ensureSite`, which seeds this template with the organization's name
substituted in. Every word is an editable default, not fixed chrome: the
template is a finished starting point, never a constraint.

## Site config

`Site.config` (validated by `src/site/site-config.ts`) holds what the chrome
needs: site name, tagline, accent color (hex-validated — a bad value falls back
rather than reaching a `style` attribute), contact block, and service times.
Header nav lists `inNav` pages in `sortOrder`; the footer shows contact +
service times.

## Publishing and preview

- `Site.published` gates the public surface. Unpublished sites 404 at
  `/w/<key>` — except for a signed-in staff session of the same organization
  (`lib/site-request.ts`), which is the studio's preview path. The studio link
  works before publish; the world's doesn't.
- `publicSiteKey` is an unguessable cuid, resolved via `rawDb` — the same
  documented bootstrapping exception as `publicAppId` and form/event publicIds.
  Everything else in `site-service` is tenant-scoped.

## Studio

`/studio/website` — the full-page builder, opened in its own tab from the
sidebar's Website link (Wix-style): a top bar (exit to dashboard, page
switcher, publish toggle, view live) over a full-height live canvas and
inspector. It is the same `WebsiteSectionEditor` (with `fullScreen` chrome),
the same `app.manage` permission, and the same audited actions as everything
below — only the chrome differs.

`/website` (dashboard) — publish toggle + public URL, site settings, and the
page list (reorder, nav toggle, create/delete; the home page can't be deleted
or put in the nav — it's the logo link); its edit buttons open the builder in
a new tab. `/website/pages/<id>` still edits one page's sections embedded in
the dashboard shell. Managing the website shares the `app.manage`
permission with App Studio — one "digital presence" responsibility. All
mutations are audited (`site.*` actions).

Client components never import `@cms/database` at runtime (Prisma/node:crypto
must not enter the browser bundle): `lib/site-sections-ui.ts` mirrors the
section-kind constants, and `parseSections` re-validates server-side on save,
so drift can mislabel a button but never corrupt data.

The `sermons` live section plays the newest embeddable message inline:
`videoEmbedUrl` (packages/database `site/video-embed.ts`) recognizes YouTube
(watch/short/live/embed links → the privacy-enhanced `youtube-nocookie.com`
player) and Vimeo, with strict id validation so arbitrary strings never
become iframe sources; everything else stays a card linking out.

Image fields (hero background, text+image art, team photos) accept a pasted
URL or an upload: `uploadSiteImageAction` stores to PUBLIC storage (the public
site serves images by URL, so like newsletter images they can't live in the
private bucket), validates PNG/JPEG/GIF/WebP up to 4 MB, audits as
`site.image_uploaded`, and returns an absolute URL for the section's
`imageUrl`.

## Invariants

1. Everything rendered at `/w/` is already-public content — events, sermons,
   published groups, and copy the church wrote. No person data, ever.
2. Sections are validated on write **and** on read; stored JSON is never
   trusted.
3. Live sections read from the same services as the church app
   (`lib/site-content.ts` mirrors `lib/church-app-content.ts`), so app, studio
   preview, and website always agree.
4. Draft sites are invisible to the public but previewable by their own staff.
