import {
  CalendarDays,
  Clapperboard,
  ExternalLink,
  FileText,
  Heart,
  Home,
  Link as LinkIcon,
  MapPin,
  ClipboardList,
  PlayCircle,
  Radio,
  Users2,
} from "lucide-react";
import type { AppLinkTarget, AppManifest, AppPageBlock, AppTab } from "@cms/database";
import { appTabLabelUi as appTabLabel } from "../../lib/app-manifest-ui";
import { PageBlocksView, type ResolvedLink } from "./PageBlocksView";

/**
 * The church app's screen (docs/domain/app.md) — one pure component rendered in
 * two places: App Studio's live phone preview (client, draft manifest + sample
 * content) and the public /a/<id> PWA (server, saved manifest + live content).
 * Keeping them identical is the point: what the church designs is exactly what
 * the congregation installs. All content is plain serializable data.
 */

export interface AppEventItem {
  id: string;
  title: string;
  when: string;
  location: string | null;
}
export interface AppSermonItem {
  id: string;
  title: string;
  speaker: string | null;
  series: string | null;
  passage: string | null;
  when: string;
  videoUrl: string | null;
}
export interface AppGroupItem {
  id: string;
  name: string;
  description: string | null;
}
export interface AppFormItem {
  id: string;
  title: string;
  href: string;
}
export interface AppPageItem {
  id: string;
  title: string;
  blocks: AppPageBlock[];
}
export interface AppContent {
  events: AppEventItem[];
  sermons: AppSermonItem[];
  groups: AppGroupItem[];
  forms: AppFormItem[];
  pages: AppPageItem[];
}

function tabIcon(tab: AppTab, size = 20) {
  switch (tab.kind) {
    case "home":
      return <Home size={size} />;
    case "events":
      return <CalendarDays size={size} />;
    case "sermons":
      return <Clapperboard size={size} />;
    case "groups":
      return <Users2 size={size} />;
    case "forms":
      return <ClipboardList size={size} />;
    case "giving":
      return <Heart size={size} />;
    case "livestream":
      return <Radio size={size} />;
    case "page":
      return <FileText size={size} />;
    case "link":
      return <LinkIcon size={size} />;
  }
}

/** Best-effort embed URL (mirror of the canonical helper in @cms/database). */
function embedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/embed/")) return url;
      if (parsed.pathname.startsWith("/live/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      return null;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.slice(1).split("/")[0] ?? "";
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "player.vimeo.com") return url;
    return null;
  } catch {
    return null;
  }
}

function SermonCard({ sermon, accent }: { sermon: AppSermonItem; accent: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-500">
        {sermon.when}
        {sermon.series && ` · ${sermon.series}`}
      </p>
      <p className="mt-0.5 font-semibold text-neutral-900">{sermon.title}</p>
      <p className="text-sm text-neutral-600">
        {[sermon.speaker, sermon.passage].filter(Boolean).join(" · ") || " "}
      </p>
      {sermon.videoUrl && (
        <a
          href={sermon.videoUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: accent }}
        >
          <PlayCircle size={16} /> Watch
        </a>
      )}
    </div>
  );
}

export function AppScreen({
  manifest,
  organizationName,
  content,
  activeIndex,
  onSelectTab,
  tabHref,
  homeFeed,
}: {
  manifest: AppManifest;
  organizationName: string;
  content: AppContent;
  activeIndex: number;
  /** Preview mode: switch tabs client-side. */
  onSelectTab?: (index: number) => void;
  /** Public mode: real links per tab index. */
  tabHref?: (index: number) => string;
  /** Community feed for the Home tab; when set it replaces the static highlights. */
  homeFeed?: React.ReactNode;
}) {
  const accent = manifest.themeColor;
  const active = manifest.tabs[activeIndex] ?? manifest.tabs[0]!;

  // Custom-page link targets: `tab` switches the bottom bar (falls back to Home
  // when the target tab isn't among the 5), `inapp` stays in this tab on web,
  // `external` opens a new tab. Native shells map these to richer behaviors.
  const resolvePageTarget = (target: AppLinkTarget): ResolvedLink => {
    if (target.kind === "tab") {
      const index = Math.max(
        0,
        manifest.tabs.findIndex((t) => t.kind === target.tab),
      );
      if (onSelectTab) return { onClick: () => onSelectTab(index) };
      return tabHref ? { href: tabHref(index), newTab: false } : null;
    }
    if (onSelectTab) return null; // preview: never navigate the studio
    return { href: target.url, newTab: target.kind === "external" };
  };

  const body = (() => {
    switch (active.kind) {
      case "home":
        return (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl p-5 text-white" style={{ backgroundColor: accent }}>
              <p className="text-lg font-bold leading-snug">{manifest.welcome || `Welcome to ${organizationName}!`}</p>
              {manifest.givingUrl && (
                <a
                  href={manifest.givingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold"
                  style={{ color: accent }}
                >
                  <Heart size={15} /> Give
                </a>
              )}
            </div>
            {homeFeed}
            {!homeFeed && content.events.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Coming up</p>
                <div className="flex flex-col gap-2">
                  {content.events.slice(0, 3).map((event) => (
                    <div key={event.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                      <p className="font-semibold text-neutral-900">{event.title}</p>
                      <p className="text-sm text-neutral-600">{event.when}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!homeFeed && content.sermons[0] && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Latest message</p>
                <SermonCard sermon={content.sermons[0]} accent={accent} />
              </div>
            )}
          </div>
        );
      case "events":
        return content.events.length === 0 ? (
          <Empty label="No upcoming events" />
        ) : (
          <div className="flex flex-col gap-2">
            {content.events.map((event) => (
              <div key={event.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="font-semibold text-neutral-900">{event.title}</p>
                <p className="text-sm text-neutral-600">{event.when}</p>
                {event.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                    <MapPin size={12} /> {event.location}
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      case "sermons":
        return content.sermons.length === 0 ? (
          <Empty label="No sermons yet" />
        ) : (
          <div className="flex flex-col gap-2">
            {content.sermons.map((sermon) => (
              <SermonCard key={sermon.id} sermon={sermon} accent={accent} />
            ))}
          </div>
        );
      case "groups":
        return content.groups.length === 0 ? (
          <Empty label="No groups right now" />
        ) : (
          <div className="flex flex-col gap-2">
            {content.groups.map((group) => (
              <div key={group.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="font-semibold text-neutral-900">{group.name}</p>
                {group.description && <p className="text-sm text-neutral-600">{group.description}</p>}
              </div>
            ))}
          </div>
        );
      case "forms":
        return content.forms.length === 0 ? (
          <Empty label="Nothing to fill out right now" />
        ) : (
          <div className="flex flex-col gap-2">
            {content.forms.map((form) => (
              <a
                key={form.id}
                href={form.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4"
              >
                <span className="font-semibold text-neutral-900">{form.title}</span>
                <ExternalLink size={15} className="text-neutral-400" />
              </a>
            ))}
          </div>
        );
      case "giving":
        return (
          <div className="pt-8 text-center">
            {manifest.givingUrl ? (
              <>
                <Heart size={34} className="mx-auto" style={{ color: accent }} />
                <p className="mx-auto mt-3 max-w-[240px] text-sm text-neutral-600">
                  Your generosity makes ministry happen. Thank you.
                </p>
                <a
                  href={onSelectTab ? undefined : manifest.givingUrl}
                  className="mt-4 inline-flex items-center gap-2 rounded-full px-8 py-3 font-semibold text-white"
                  style={{ backgroundColor: accent }}
                >
                  <Heart size={15} /> Give now
                </a>
              </>
            ) : (
              <Empty label="Giving isn't set up yet — add a giving link in App Studio" />
            )}
          </div>
        );
      case "livestream": {
        const embed = embedUrl(active.url);
        return (
          <div>
            {embed ? (
              <div className="overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9" }}>
                <iframe
                  src={embed}
                  title="Livestream"
                  className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
                <Radio size={28} className="mx-auto" style={{ color: accent }} />
                <p className="mt-2 text-sm text-neutral-600">Our livestream opens in the browser.</p>
              </div>
            )}
            <a
              href={onSelectTab ? undefined : active.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-2.5 text-sm font-semibold"
              style={{ color: accent }}
            >
              Watch on the streaming site <ExternalLink size={14} />
            </a>
          </div>
        );
      }
      case "page": {
        const page = content.pages.find((p) => p.id === active.pageId);
        return page && page.blocks.length > 0 ? (
          <PageBlocksView blocks={page.blocks} accent={accent} resolveTarget={resolvePageTarget} />
        ) : (
          <Empty label="This page is being worked on — check back soon" />
        );
      }
      case "link":
        return (
          <div className="pt-8 text-center">
            <a
              href={active.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              {appTabLabel(active)} <ExternalLink size={15} />
            </a>
          </div>
        );
    }
  })();

  return (
    <div className="flex h-full flex-col bg-neutral-100">
      <header className="flex items-center gap-3 px-4 pb-3 pt-4 text-white" style={{ backgroundColor: accent }}>
        {manifest.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- church-uploaded logo URL
          <img src={manifest.logoUrl} alt="" className="h-9 w-9 rounded-lg bg-white/20 object-cover" />
        )}
        <span className="text-lg font-bold tracking-tight">{manifest.appName || organizationName}</span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4">{body}</main>
      <nav className="flex border-t border-neutral-200 bg-white">
        {manifest.tabs.map((tab, i) => {
          const isActive = i === activeIndex;
          const style = { color: isActive ? accent : "#8a8985" };
          const inner = (
            <>
              {tabIcon(tab)}
              <span className="text-[10px] font-medium">{appTabLabel(tab)}</span>
            </>
          );
          const cls = "flex flex-1 flex-col items-center gap-0.5 py-2";
          if (tab.kind === "link" && !onSelectTab) {
            return (
              <a key={i} href={tab.url} target="_blank" rel="noreferrer" className={cls} style={style}>
                {inner}
              </a>
            );
          }
          if (onSelectTab) {
            return (
              <button key={i} type="button" onClick={() => onSelectTab(i)} className={cls} style={style}>
                {inner}
              </button>
            );
          }
          return (
            <a key={i} href={tabHref ? tabHref(i) : "#"} className={cls} style={style}>
              {inner}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="pt-10 text-center text-sm text-neutral-500">{label}</p>;
}
