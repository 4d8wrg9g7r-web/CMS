"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Eye, EyeOff, Loader2, Palette } from "lucide-react";
import type { SiteConfig, SiteFontId } from "@cms/database";
import { SITE_FONTS_UI } from "../lib/site-fonts-ui";
import { Inspector } from "./ui/Inspector";
import { Input, Select } from "./ui/Input";
import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";
import { publishSiteAction, saveSiteConfigAction } from "../app/(dashboard)/website/actions";

/**
 * Top chrome of the full-page website builder (/studio/website): exit back to
 * the dashboard, switch pages, open the theme panel (accent + typeface), see
 * live state, publish/unpublish, open the live site. Full site settings
 * (contact, service times, pages) stay on /website.
 */

const ACCENT_SWATCHES = ["#1d4ed8", "#2566e8", "#b91c1c", "#c2410c", "#b45309", "#15803d", "#0f766e", "#7e22ce", "#be185d", "#1f2937"];

/** One radio-card group of the curated typefaces, previewing real sample text. */
function FontPicker({
  label,
  hint,
  value,
  onChange,
  sample,
  bold,
  group,
}: {
  label: string;
  hint: string;
  value: SiteFontId;
  onChange: (id: SiteFontId) => void;
  sample: string;
  bold?: boolean;
  group: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      <div className="mt-3 space-y-2" role="radiogroup" aria-label={label}>
        {SITE_FONTS_UI.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            data-font-option={`${group}:${option.id}`}
            className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors duration-150 ${
              value === option.id ? "border-accent bg-surface-warm" : "border-border bg-surface hover:border-border-strong"
            }`}
          >
            <span className={`text-xs ${value === option.id ? "font-semibold text-accent" : "font-medium text-ink-secondary"}`}>
              {option.label}
            </span>
            <span className={`mt-0.5 block truncate text-ink ${bold ? "text-lg font-bold" : "text-[15px]"}`} style={{ fontFamily: option.stack }}>
              {sample}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemePanel({ config, open, onClose }: { config: SiteConfig; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [accent, setAccent] = useState(config.theme.accentColor);
  const [font, setFont] = useState<SiteFontId>(config.theme.font);
  const [headingFont, setHeadingFont] = useState<SiteFontId>(config.theme.headingFont);

  const save = () => {
    startTransition(async () => {
      const result = await saveSiteConfigAction({ config: { ...config, theme: { accentColor: accent, font, headingFont } } });
      if (result.ok) {
        showToast("Theme saved", "success");
        // The editor owns the preview iframe; ask it to reload with the new theme.
        window.dispatchEvent(new CustomEvent("cms:reload-preview"));
        router.refresh();
        onClose();
      } else {
        showToast(result.error ?? "Could not save the theme", "error");
      }
    });
  };

  return (
    <Inspector open={open} onClose={onClose} title="Theme">
      <div className="flex h-full flex-col" data-section="theme-panel">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Accent color</p>
          <p className="mt-1 text-xs text-ink-muted">Buttons, links, and highlights across the site.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ACCENT_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setAccent(hex)}
                aria-label={`Accent ${hex}`}
                aria-pressed={accent.toLowerCase() === hex}
                data-swatch={hex}
                className={`h-8 w-8 rounded-full border transition-transform duration-150 ${
                  accent.toLowerCase() === hex ? "scale-110 border-ink ring-2 ring-accent/40" : "border-black/10 hover:scale-105"
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#1d4ed8"}
              onChange={(e) => setAccent(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-sm border border-border-strong bg-surface"
              aria-label="Custom accent color"
            />
            <Input value={accent} onChange={(e) => setAccent(e.target.value)} className="w-28" maxLength={7} aria-label="Accent hex" />
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <FontPicker
            label="Headings"
            hint="Site name, hero headline, and section titles."
            value={headingFont}
            onChange={setHeadingFont}
            sample="Grace That Finds Us"
            bold
            group="heading"
          />
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <FontPicker
            label="Body"
            hint="Paragraphs, cards, and everything else. System stacks — nothing to load."
            value={font}
            onChange={setFont}
            sample="Sunday gatherings at 10 AM — everyone is welcome."
            group="body"
          />
        </div>

        <div className="mt-auto border-t border-border pt-5">
          <Button onClick={save} disabled={isPending} className="w-full" data-action="save-theme">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : null} Save theme
          </Button>
        </div>
      </div>
    </Inspector>
  );
}

export function StudioTopBar({
  siteName,
  pages,
  currentPageId,
  published,
  liveUrl,
  config,
}: {
  siteName: string;
  pages: { id: string; title: string; slug: string }[];
  currentPageId: string;
  published: boolean;
  liveUrl: string;
  config: SiteConfig;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [themeOpen, setThemeOpen] = useState(false);

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

      <button
        type="button"
        onClick={() => setThemeOpen(true)}
        data-action="open-theme"
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-180 hover:bg-surface-muted hover:text-ink"
      >
        <Palette size={15} style={{ color: config.theme.accentColor }} /> Theme
      </button>

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

      <ThemePanel key={themeOpen ? "open" : "closed"} config={config} open={themeOpen} onClose={() => setThemeOpen(false)} />
    </header>
  );
}
