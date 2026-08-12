"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, FilePlus2, Loader2, Pencil, Trash2 } from "lucide-react";
import type { SiteConfig } from "@cms/database";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Input } from "./ui/Input";
import { useToast } from "./ui/Toast";
import {
  createSitePageAction,
  deleteSitePageAction,
  publishSiteAction,
  saveSiteConfigAction,
  updateSitePageAction,
} from "../app/(dashboard)/website/actions";

/**
 * Website studio overview (docs/domain/website.md): publish state + public URL,
 * site settings (name, tagline, accent, contact, service times), and the page
 * list. Section editing lives on each page's own editor screen.
 */

interface PageItem {
  id: string;
  slug: string;
  title: string;
  inNav: boolean;
  sortOrder: number;
  sectionCount: number;
}

interface Props {
  published: boolean;
  siteUrl: string | null;
  config: SiteConfig;
  pages: PageItem[];
}

export function WebsiteStudio({ published, siteUrl, config: initialConfig, pages }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [config, setConfig] = useState<SiteConfig>(initialConfig);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        showToast(successMessage, "success");
        router.refresh();
      } else {
        showToast(result.error ?? "Something went wrong", "error");
      }
    });
  };

  const move = (page: PageItem, direction: -1 | 1) => {
    const ordered = [...pages].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((p) => p.id === page.id);
    const swap = ordered[index + direction];
    if (!swap) return;
    startTransition(async () => {
      await updateSitePageAction({ pageId: page.id, sortOrder: swap.sortOrder });
      await updateSitePageAction({ pageId: swap.id, sortOrder: page.sortOrder });
      router.refresh();
    });
  };

  const setServiceTime = (index: number, field: "label" | "time", value: string) => {
    setConfig((c) => ({
      ...c,
      serviceTimes: c.serviceTimes.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {/* Publish state */}
        <Card padding="md" data-section="site-publish">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{published ? "Your website is live" : "Draft — not published yet"}</p>
              {siteUrl ? (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-sm text-accent hover:underline"
                >
                  {siteUrl} <ExternalLink size={13} />
                </a>
              ) : null}
              {!published ? (
                <p className="mt-0.5 text-xs text-ink-muted">The link works for you while signed in, so you can preview before publishing.</p>
              ) : null}
            </div>
            <Button
              variant={published ? "secondary" : "primary"}
              size="sm"
              disabled={isPending}
              onClick={() => run(() => publishSiteAction(!published), published ? "Website unpublished" : "Website published")}
            >
              {published ? "Unpublish" : "Publish website"}
            </Button>
          </div>
        </Card>

        {/* Pages */}
        <Card padding="md" data-section="site-pages">
          <h2 className="mb-3 text-sm font-semibold text-ink">Pages</h2>
          <div className="divide-y divide-border">
            {pages.map((page, index) => (
              <div key={page.id} className="flex items-center gap-2 py-2.5" data-page={page.slug}>
                <div className="flex flex-col">
                  <button
                    className="text-ink-muted hover:text-ink disabled:opacity-30"
                    disabled={index === 0 || isPending}
                    onClick={() => move(page, -1)}
                    aria-label={`Move ${page.title} up`}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="text-ink-muted hover:text-ink disabled:opacity-30"
                    disabled={index === pages.length - 1 || isPending}
                    onClick={() => move(page, 1)}
                    aria-label={`Move ${page.title} down`}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{page.title}</p>
                  <p className="text-xs text-ink-muted">
                    {page.slug === "home" ? "Home page" : `/${page.slug}`} · {page.sectionCount} section{page.sectionCount === 1 ? "" : "s"}
                  </p>
                </div>
                {page.slug !== "home" ? (
                  <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={page.inNav}
                      disabled={isPending}
                      onChange={(e) =>
                        run(() => updateSitePageAction({ pageId: page.id, inNav: e.target.checked }), "Page updated")
                      }
                    />
                    In nav
                  </label>
                ) : null}
                <Link href={`/website/pages/${page.id}`} className="rounded-sm p-1.5 text-ink-secondary hover:bg-surface-muted hover:text-ink" aria-label={`Edit ${page.title}`}>
                  <Pencil size={15} />
                </Link>
                {page.slug !== "home" ? (
                  <button
                    className="rounded-sm p-1.5 text-ink-muted hover:bg-danger-bg hover:text-danger"
                    disabled={isPending}
                    onClick={() => {
                      if (window.confirm(`Delete the "${page.title}" page? This can't be undone.`)) {
                        run(() => deleteSitePageAction(page.id), "Page deleted");
                      }
                    }}
                    aria-label={`Delete ${page.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const title = newTitle.trim();
              const slug = (newSlug.trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).toLowerCase();
              run(async () => {
                const result = await createSitePageAction({ slug, title });
                if (result.ok) {
                  setNewTitle("");
                  setNewSlug("");
                }
                return result;
              }, "Page created");
            }}
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">New page title</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Small Groups" className="w-44" required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Slug (optional)</label>
              <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="small-groups" className="w-40" />
            </div>
            <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />} Add page
            </Button>
          </form>
        </Card>
      </div>

      {/* Site settings */}
      <Card padding="md" className="h-fit" data-section="site-settings">
        <h2 className="mb-3 text-sm font-semibold text-ink">Site settings</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Site name</label>
            <Input value={config.siteName} onChange={(e) => setConfig({ ...config, siteName: e.target.value })} maxLength={120} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Tagline</label>
            <Input value={config.tagline} onChange={(e) => setConfig({ ...config, tagline: e.target.value })} maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Accent color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.theme.accentColor}
                onChange={(e) => setConfig({ ...config, theme: { accentColor: e.target.value } })}
                className="h-9 w-12 cursor-pointer rounded-sm border border-border-strong bg-surface"
                aria-label="Accent color"
              />
              <Input
                value={config.theme.accentColor}
                onChange={(e) => setConfig({ ...config, theme: { accentColor: e.target.value } })}
                className="w-28"
                maxLength={7}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Address</label>
            <Input value={config.contact.address} onChange={(e) => setConfig({ ...config, contact: { ...config.contact, address: e.target.value } })} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Phone</label>
              <Input value={config.contact.phone} onChange={(e) => setConfig({ ...config, contact: { ...config.contact, phone: e.target.value } })} maxLength={40} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Email</label>
              <Input value={config.contact.email} onChange={(e) => setConfig({ ...config, contact: { ...config.contact, email: e.target.value } })} maxLength={200} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-secondary">Service times</p>
            <div className="space-y-2">
              {config.serviceTimes.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={t.label} onChange={(e) => setServiceTime(i, "label", e.target.value)} placeholder="Sunday Worship" className="flex-1" maxLength={120} />
                  <Input value={t.time} onChange={(e) => setServiceTime(i, "time", e.target.value)} placeholder="Sundays · 10:00 AM" className="flex-1" maxLength={120} />
                  <button
                    className="p-1 text-ink-muted hover:text-danger"
                    onClick={() => setConfig((c) => ({ ...c, serviceTimes: c.serviceTimes.filter((_, j) => j !== i) }))}
                    aria-label="Remove service time"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="mt-2 text-xs font-medium text-accent hover:underline"
              onClick={() => setConfig((c) => ({ ...c, serviceTimes: [...c.serviceTimes, { label: "", time: "" }] }))}
              disabled={config.serviceTimes.length >= 12}
            >
              + Add service time
            </button>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={isPending}
            onClick={() => run(() => saveSiteConfigAction({ config }), "Site settings saved")}
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : null} Save settings
          </Button>
        </div>
      </Card>
    </div>
  );
}
