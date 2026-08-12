"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
import { Select } from "./ui/Input";
import { useToast } from "./ui/Toast";
import { publishSiteAction } from "../app/(dashboard)/website/actions";

/**
 * Top chrome of the full-page website builder (/studio/website): exit back to
 * the dashboard, switch pages, see live state, publish/unpublish, open the
 * live site. Site settings (theme, contact, service times) stay on /website —
 * the builder links back rather than duplicating them.
 */
export function StudioTopBar({
  siteName,
  pages,
  currentPageId,
  published,
  liveUrl,
}: {
  siteName: string;
  pages: { id: string; title: string; slug: string }[];
  currentPageId: string;
  published: boolean;
  liveUrl: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const setPublished = (next: boolean) => {
    startTransition(async () => {
      const result = await publishSiteAction(next);
      if (result.ok) {
        showToast(next ? "Site published" : "Site unpublished", "success");
        router.refresh();
      } else {
        showToast(result.error ?? "Could not update the site", "error");
      }
    });
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4" data-section="studio-topbar">
      <Link
        href="/website"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-180 hover:bg-surface-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> Dashboard
      </Link>
      <span className="hidden truncate text-sm font-semibold text-ink sm:block">{siteName}</span>

      <div className="mx-auto flex items-center gap-2">
        <label className="text-xs font-medium text-ink-muted" htmlFor="studio-page-select">
          Page
        </label>
        <Select
          id="studio-page-select"
          value={currentPageId}
          onChange={(e) => router.push(`/studio/website?page=${e.target.value}`)}
          className="w-52 py-1.5 text-sm"
          aria-label="Edit page"
        >
          {pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.slug === "home" ? "Home" : page.title}
            </option>
          ))}
        </Select>
      </div>

      <span
        className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:block ${
          published ? "bg-success/10 text-success" : "bg-surface-muted text-ink-muted"
        }`}
        data-testid="studio-publish-state"
      >
        {published ? "Live" : "Draft"}
      </span>
      {published ? (
        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-accent transition-colors duration-180 hover:bg-surface-muted"
        >
          View live <ExternalLink size={13} />
        </a>
      ) : null}
      <button
        type="button"
        onClick={() => setPublished(!published)}
        disabled={isPending}
        data-action="studio-publish-toggle"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors duration-180 hover:border-border-strong disabled:opacity-60"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : published ? <EyeOff size={14} /> : <Eye size={14} />}
        {published ? "Unpublish" : "Publish"}
      </button>
    </header>
  );
}
