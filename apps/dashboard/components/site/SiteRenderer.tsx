import Link from "next/link";
import { SITE_FONTS, videoEmbedUrl } from "@cms/database";
import type { PublicSite, PublicSitePage, SiteSection } from "@cms/database";
import type { SiteLiveContent } from "../../lib/site-content";
import { StudioEditableText } from "./StudioEditableText";
import { StudioSectionTarget } from "./StudioSectionTarget";

/**
 * The public website renderer (docs/domain/website.md) — server component used
 * by /w/<publicSiteKey> and, in preview mode, by the Website studio, so the
 * studio preview and the live site can never disagree. All copy comes from the
 * page's section blocks; live sections render from SiteLiveContent.
 */

interface Props {
  site: PublicSite;
  page: PublicSitePage;
  live: SiteLiveContent;
  /** Base path for internal links — /w/<key> normally, the preview route in the studio. */
  basePath: string;
  /** Studio mode: wrap sections in click-to-select targets (staff preview only). */
  selectable?: boolean;
}

/** Internal section-block links ("/plan-a-visit") live under the site's base path. */
function resolveHref(basePath: string, href: string): string {
  if (!href) return basePath;
  if (/^https?:\/\//.test(href)) return href;
  if (/^\/(a|g|c|e|f)\//.test(href)) return href; // existing public CMS surfaces
  if (href.startsWith("/")) return href === "/" ? basePath : `${basePath}${href}`;
  return `${basePath}/${href}`;
}

/** Tiny escaped body renderer: paragraphs and "- " bullet lists. No raw HTML. */
function BodyText({ text, className }: { text: string; className?: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="mb-4 list-disc space-y-1 pl-5 last:mb-0">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mb-4 last:mb-0">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function SectionShell({ children, tone }: { children: React.ReactNode; tone?: "muted" }) {
  return (
    <section className={tone === "muted" ? "bg-slate-50" : "bg-white"}>
      <div className="mx-auto max-w-5xl px-6 py-14">{children}</div>
    </section>
  );
}

/** Headings (site name, hero, section titles) render in the theme's heading stack. */
const HEADING_STYLE: React.CSSProperties = { fontFamily: "var(--site-heading-font)" };

function SectionTitle({ children, editIndex }: { children: React.ReactNode; editIndex?: number }) {
  const className = "mb-6 text-2xl font-bold tracking-tight text-slate-900";
  // In studio mode plain string titles edit in place (docs/domain/website.md "Studio").
  if (editIndex !== undefined && typeof children === "string") {
    return <StudioEditableText as="h2" index={editIndex} field="title" value={children} className={className} style={HEADING_STYLE} />;
  }
  return (
    <h2 className={className} style={HEADING_STYLE}>
      {children}
    </h2>
  );
}

function CtaButtons({ ctas, basePath, accent }: { ctas: { label: string; href: string }[]; basePath: string; accent: string }) {
  if (ctas.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {ctas.map((cta, i) => (
        <Link
          key={i}
          href={resolveHref(basePath, cta.href)}
          className={
            i === 0
              ? "rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              : "rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
          }
          style={i === 0 ? { backgroundColor: accent } : undefined}
        >
          {cta.label}
        </Link>
      ))}
    </div>
  );
}

function Section({
  section,
  site,
  live,
  basePath,
  editIndex,
}: {
  section: SiteSection;
  site: PublicSite;
  live: SiteLiveContent;
  basePath: string;
  /** Set only in studio mode: this section's index, enabling in-place text editing. */
  editIndex?: number;
}) {
  const accent = site.config.theme.accentColor;
  switch (section.kind) {
    case "hero":
      return (
        <section
          className="relative bg-slate-900 text-white"
          style={
            section.imageUrl
              ? { backgroundImage: `linear-gradient(rgba(15,23,42,.65), rgba(15,23,42,.65)), url(${section.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
          }
        >
          <div className="mx-auto max-w-5xl px-6 py-24">
            {editIndex !== undefined ? (
              <StudioEditableText
                as="h1"
                index={editIndex}
                field="headline"
                value={section.headline}
                className="mb-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl"
                style={HEADING_STYLE}
              />
            ) : (
              <h1 className="mb-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl" style={HEADING_STYLE}>
                {section.headline}
              </h1>
            )}
            {section.subheadline ? (
              editIndex !== undefined ? (
                <StudioEditableText
                  as="p"
                  index={editIndex}
                  field="subheadline"
                  value={section.subheadline}
                  className="mb-8 max-w-2xl text-lg text-slate-200"
                />
              ) : (
                <p className="mb-8 max-w-2xl text-lg text-slate-200">{section.subheadline}</p>
              )
            ) : null}
            <CtaButtons ctas={section.ctas} basePath={basePath} accent={accent} />
          </div>
        </section>
      );
    case "serviceTimes":
      return (
        <SectionShell tone="muted">
          {section.title ? <SectionTitle editIndex={editIndex}>{section.title}</SectionTitle> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {site.config.serviceTimes.map((t, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-900">{t.label}</p>
                <p className="mt-1 text-sm" style={{ color: accent }}>
                  {t.time}
                </p>
              </div>
            ))}
          </div>
        </SectionShell>
      );
    case "textImage":
      return (
        <SectionShell>
          <div className={`grid items-center gap-10 ${section.imageUrl ? "md:grid-cols-2" : ""}`}>
            {section.imageUrl && section.imageSide === "left" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={section.imageUrl} alt="" className="rounded-xl object-cover" />
            ) : null}
            <div>
              <SectionTitle editIndex={editIndex}>{section.title}</SectionTitle>
              <BodyText text={section.body} className="text-slate-600" />
            </div>
            {section.imageUrl && section.imageSide === "right" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={section.imageUrl} alt="" className="rounded-xl object-cover" />
            ) : null}
          </div>
        </SectionShell>
      );
    case "cardGrid":
      return (
        <SectionShell tone="muted">
          <SectionTitle editIndex={editIndex}>{section.title}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.cards.map((card, i) => {
              const body = (
                <div key={i} className="h-full rounded-xl border border-slate-200 bg-white p-5">
                  <p className="mb-1.5 text-sm font-semibold text-slate-900">{card.title}</p>
                  <p className="text-sm text-slate-600">{card.body}</p>
                </div>
              );
              return card.href ? (
                <Link key={i} href={resolveHref(basePath, card.href)}>
                  {body}
                </Link>
              ) : (
                body
              );
            })}
          </div>
        </SectionShell>
      );
    case "events":
      return (
        <SectionShell>
          <SectionTitle editIndex={editIndex}>{section.title}</SectionTitle>
          {live.events.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing on the calendar right now — check back soon.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {live.events.slice(0, section.limit).map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 p-5" data-live="event">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                    {event.when}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-900">{event.title}</p>
                  {event.location ? <p className="mt-1 text-sm text-slate-500">{event.location}</p> : null}
                </div>
              ))}
            </div>
          )}
          <p className="mt-6">
            <Link href={`/c/${site.publicSiteId}`} className="text-sm font-semibold" style={{ color: accent }}>
              Full calendar →
            </Link>
          </p>
        </SectionShell>
      );
    case "sermons": {
      const shown = live.sermons.slice(0, section.limit);
      // The newest embeddable message plays inline; the rest stay as cards.
      const featured = shown.find((s) => videoEmbedUrl(s.videoUrl));
      const featuredEmbed = featured ? videoEmbedUrl(featured.videoUrl) : null;
      return (
        <SectionShell tone="muted">
          <SectionTitle editIndex={editIndex}>{section.title}</SectionTitle>
          {shown.length === 0 ? (
            <p className="text-sm text-slate-500">Messages will appear here soon.</p>
          ) : (
            <>
              {featured && featuredEmbed ? (
                <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white" data-live="sermon-embed">
                  <div className="aspect-video w-full">
                    <iframe
                      src={featuredEmbed}
                      title={featured.title}
                      className="h-full w-full"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                  <div className="px-5 py-4">
                    {featured.series ? (
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                        {featured.series}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm font-semibold text-slate-900">{featured.title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{[featured.speaker, featured.when].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.filter((s) => s.id !== featured?.id).map((sermon) => {
                const card = (
                  <div className="h-full rounded-xl border border-slate-200 bg-white p-5" data-live="sermon">
                    {sermon.series ? (
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                        {sermon.series}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">{sermon.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {[sermon.speaker, sermon.when].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                );
                return sermon.videoUrl ? (
                  <a key={sermon.id} href={sermon.videoUrl} target="_blank" rel="noreferrer">
                    {card}
                  </a>
                ) : (
                  <div key={sermon.id}>{card}</div>
                );
              })}
            </div>
            </>
          )}
        </SectionShell>
      );
    }
    case "groups":
      return (
        <SectionShell>
          <SectionTitle editIndex={editIndex}>{section.title}</SectionTitle>
          {live.groups.length === 0 ? (
            <p className="text-sm text-slate-500">Groups are forming — check back soon.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {live.groups.slice(0, section.limit).map((group) => (
                <div key={group.id} className="rounded-xl border border-slate-200 p-5" data-live="group">
                  <p className="text-sm font-semibold text-slate-900">{group.name}</p>
                  {group.description ? <p className="mt-1 text-sm text-slate-500">{group.description}</p> : null}
                </div>
              ))}
            </div>
          )}
          <p className="mt-6">
            <Link href={`/g/${site.publicSiteId}`} className="text-sm font-semibold" style={{ color: accent }}>
              Browse all groups →
            </Link>
          </p>
        </SectionShell>
      );
    case "give":
      return (
        <section style={{ backgroundColor: accent }}>
          <div className="mx-auto max-w-5xl px-6 py-14 text-white">
            <h2 className="mb-3 text-2xl font-bold tracking-tight">{section.title}</h2>
            {section.body ? <BodyText text={section.body} className="mb-6 max-w-2xl text-white/85" /> : null}
            {site.publicAppId ? (
              <Link
                href={`/a/${site.publicAppId}`}
                className="inline-block rounded-lg bg-white px-5 py-2.5 text-sm font-semibold shadow-sm"
                style={{ color: accent }}
              >
                Give online
              </Link>
            ) : null}
          </div>
        </section>
      );
    case "cta":
      return (
        <SectionShell tone="muted">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="mb-2 text-2xl font-bold tracking-tight text-slate-900">{section.title}</h2>
            {section.body ? <BodyText text={section.body} className="mx-auto mb-6 max-w-xl text-slate-600" /> : null}
            <div className="flex justify-center">
              <CtaButtons ctas={section.ctas} basePath={basePath} accent={accent} />
            </div>
          </div>
        </SectionShell>
      );
    case "team":
      if (section.people.length === 0) return null;
      return (
        <SectionShell>
          <SectionTitle editIndex={editIndex}>{section.title}</SectionTitle>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {section.people.map((person, i) => (
              <div key={i} className="text-center">
                {person.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.imageUrl} alt={person.name} className="mx-auto mb-3 h-24 w-24 rounded-full object-cover" />
                ) : (
                  <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-2xl font-semibold text-slate-400">
                    {person.name.charAt(0)}
                  </div>
                )}
                <p className="text-sm font-semibold text-slate-900">{person.name}</p>
                <p className="text-sm text-slate-500">{person.role}</p>
              </div>
            ))}
          </div>
        </SectionShell>
      );
    case "visit":
      return (
        <SectionShell tone="muted">
          <SectionTitle editIndex={editIndex}>{section.title}</SectionTitle>
          {section.body ? <BodyText text={section.body} className="mb-6 max-w-2xl text-slate-600" /> : null}
          <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-3" data-section="visit">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Location</p>
              <p className="text-sm text-slate-700">{site.config.contact.address || "Address coming soon"}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</p>
              {site.config.contact.phone ? <p className="text-sm text-slate-700">{site.config.contact.phone}</p> : null}
              {site.config.contact.email ? (
                <p className="text-sm">
                  <a href={`mailto:${site.config.contact.email}`} style={{ color: accent }}>
                    {site.config.contact.email}
                  </a>
                </p>
              ) : null}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Service times</p>
              {site.config.serviceTimes.map((t, i) => (
                <p key={i} className="text-sm text-slate-700">
                  {t.label} · {t.time}
                </p>
              ))}
            </div>
          </div>
        </SectionShell>
      );
    case "markdown":
      return (
        <SectionShell>
          <BodyText text={section.body} className="max-w-3xl text-slate-600" />
        </SectionShell>
      );
    default:
      return null;
  }
}

export function SiteRenderer({ site, page, live, basePath, selectable = false }: Props) {
  const accent = site.config.theme.accentColor;
  // Theme fonts: curated ids resolved to system stacks — never raw strings.
  // The body stack applies everywhere; headings pick up --site-heading-font.
  const fontStack = (SITE_FONTS[site.config.theme.font] ?? SITE_FONTS.modern).stack;
  const headingStack = (SITE_FONTS[site.config.theme.headingFont] ?? SITE_FONTS.modern).stack;
  return (
    <div
      className="min-h-screen bg-white text-slate-900"
      style={{ fontFamily: fontStack, "--site-heading-font": headingStack } as React.CSSProperties}
      data-site-font={site.config.theme.font}
      data-site-heading-font={site.config.theme.headingFont}
    >
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <Link href={basePath} className="text-base font-bold tracking-tight text-slate-900" style={HEADING_STYLE}>
            {site.config.siteName}
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto" data-section="site-nav">
            {site.nav.map((item) => (
              <Link
                key={item.slug}
                href={`${basePath}/${item.slug}`}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  item.slug === page.slug ? "font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
                style={item.slug === page.slug ? { color: accent } : undefined}
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {page.sections.map((section, i) =>
          selectable ? (
            <StudioSectionTarget key={i} index={i} kind={section.kind}>
              <Section section={section} site={site} live={live} basePath={basePath} editIndex={i} />
            </StudioSectionTarget>
          ) : (
            <Section key={i} section={section} site={site} live={live} basePath={basePath} />
          ),
        )}
      </main>

      <footer className="bg-slate-900 text-slate-300">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-sm font-bold text-white">{site.config.siteName}</p>
            {site.config.tagline ? <p className="text-sm text-slate-400">{site.config.tagline}</p> : null}
          </div>
          <div className="text-sm">
            {site.config.contact.address ? <p>{site.config.contact.address}</p> : null}
            {site.config.contact.phone ? <p className="mt-1">{site.config.contact.phone}</p> : null}
            {site.config.contact.email ? (
              <p className="mt-1">
                <a href={`mailto:${site.config.contact.email}`} className="hover:text-white">
                  {site.config.contact.email}
                </a>
              </p>
            ) : null}
          </div>
          <div className="text-sm">
            {site.config.serviceTimes.map((t, i) => (
              <p key={i} className={i > 0 ? "mt-1" : undefined}>
                {t.label} · {t.time}
              </p>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
