import Link from "next/link";
import { Images, Lock, Search, Trash2, Upload } from "lucide-react";
import { mediaService, type MediaCollection } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { buttonClasses } from "../../../components/ui/Button";
import { canApp } from "../../../lib/app-access";
import { canEvents } from "../../../lib/events-access";
import { getCurrentOrganization } from "../../../lib/session";
import { deleteMediaAssetAction, uploadMediaAssetAction } from "./actions";

const COLLECTIONS: { key: MediaCollection; label: string; blurb: string }[] = [
  { key: "event", label: "Event graphics", blurb: "Artwork for events — shown on event cards, the calendar, and the app." },
  { key: "sermon", label: "Sermon graphics", blurb: "Series and message artwork — shown with sermons on the app and website." },
];

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Media library (docs/domain/app.md): graphics organized by collection. */
export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string; q?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canEventView, canEventManage, canSermonView, canSermonManage] = await Promise.all([
    canEvents(organization.id, "event.view"),
    canEvents(organization.id, "event.manage"),
    canApp(organization.id, "sermon.view"),
    canApp(organization.id, "sermon.manage"),
  ]);
  if (!canEventView && !canSermonView) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to the Media library" description="" />
      </Card>
    );
  }

  const { collection: rawCollection, q = "" } = await searchParams;
  const visible = COLLECTIONS.filter((c) => (c.key === "event" ? canEventView : canSermonView));
  const first = visible[0];
  if (!first) return null; // unreachable: the access gate above guarantees one collection
  const active = visible.find((c) => c.key === rawCollection) ?? first;
  const canManage = active.key === "event" ? canEventManage : canSermonManage;
  const assets = await mediaService.listMediaAssets(organization.id, {
    collection: active.key,
    q: q.trim() || undefined,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-2 text-display text-[28px] leading-tight text-ink">
          <Images size={22} /> Media
        </h1>
        <p className="text-sm text-ink-secondary">{active.blurb}</p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2" data-section="media-collections">
        {visible.map((c) => (
          <Link
            key={c.key}
            href={c.key === first.key ? "/media" : `/media?collection=${c.key}`}
            aria-current={active.key === c.key ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${
              active.key === c.key
                ? "border-accent bg-accent text-white font-semibold"
                : "border-border bg-surface text-ink-secondary hover:text-ink"
            }`}
            data-collection-chip={c.key}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form action="/media" method="get" className="flex items-center gap-2">
          {active.key !== first.key && <input type="hidden" name="collection" value={active.key} />}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input name="q" defaultValue={q} placeholder="Search graphics…" className="pl-8" aria-label="Search graphics" />
          </div>
          <button type="submit" className={buttonClasses("secondary", "sm")}>
            Search
          </button>
        </form>
        {canManage && (
          <form action={uploadMediaAssetAction} className="flex items-center gap-2" data-section="media-upload">
            <input type="hidden" name="collection" value={active.key} />
            <label className={buttonClasses("secondary", "sm") + " cursor-pointer"}>
              <Upload size={14} /> Choose image
              <input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" data-action="upload-media" />
            </label>
            <button type="submit" className={buttonClasses("primary", "sm")} data-action="save-media">
              Upload
            </button>
          </form>
        )}
      </div>

      {assets.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<Images size={22} />}
            title={q ? "No graphics match your search" : `No ${active.label.toLowerCase()} yet`}
            description={canManage ? "Upload a PNG, JPEG, WebP, or GIF up to 10 MB." : ""}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-section="media-grid">
          {assets.map((asset) => (
            <Card key={asset.id} padding="none" className="overflow-hidden" data-media-asset={asset.id}>
              <a href={asset.url} target="_blank" rel="noreferrer" className="block bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails */}
                <img src={asset.url} alt={asset.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              </a>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink" title={asset.name}>
                    {asset.name}
                  </p>
                  <p className="text-xs text-ink-muted">{formatBytes(asset.sizeBytes)}</p>
                </div>
                {canManage && (
                  <form action={deleteMediaAssetAction.bind(null, asset.id)}>
                    <button type="submit" aria-label={`Delete ${asset.name}`} className="p-1 text-ink-muted hover:text-danger" data-action="delete-media">
                      <Trash2 size={14} />
                    </button>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
