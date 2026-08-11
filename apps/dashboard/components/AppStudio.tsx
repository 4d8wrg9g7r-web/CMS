"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Copy, Globe, Loader2, Plus, Rocket, Trash2, Upload } from "lucide-react";
import type { AppManifest, AppTab, AppTabKind } from "@cms/database";
import { appTabLabelUi as appTabLabel, APP_TAB_KINDS_UI as APP_TAB_KINDS, MAX_APP_TABS_UI as MAX_APP_TABS } from "../lib/app-manifest-ui";
import { buttonClasses } from "./ui/Button";
import { Input, Textarea } from "./ui/Input";
import { AppScreen, type AppContent } from "./church-app/AppScreen";
import { publishAppAction, saveAppAction, toggleAppListedAction, uploadAppLogoAction } from "../app/(dashboard)/app-studio/actions";

/**
 * App Studio (docs/domain/app.md): the church designs their app on the left and
 * watches the real thing on the right — the preview renders the same AppScreen
 * component as the public /a/<id> surface, with live CMS content. Save persists
 * the manifest; Publish flips the public surface on and reveals the install
 * link + QR code.
 */

const KIND_DESCRIPTIONS: Record<AppTabKind, string> = {
  home: "Welcome, giving, and highlights",
  events: "Upcoming events from your calendar",
  sermons: "Your sermon library",
  groups: "Group finder",
  forms: "Public forms (connect cards, signups)",
};

export function AppStudio({
  initial,
  organizationName,
  content,
  enabled,
  listed,
  installUrl,
  qrSvg,
}: {
  initial: AppManifest;
  organizationName: string;
  content: AppContent;
  enabled: boolean;
  listed: boolean;
  /** Absolute /a/<id> URL once the app row exists; null before first save. */
  installUrl: string | null;
  /** Server-generated QR SVG for the install URL (published apps only). */
  qrSvg: string | null;
}) {
  const router = useRouter();
  const [manifest, setManifest] = useState<AppManifest>(initial);
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });
  const [copied, setCopied] = useState(false);
  // Optimistic: flips immediately, reverts if the server rejects the change.
  const [isListed, setIsListed] = useState(listed);

  const set = (patch: Partial<AppManifest>) => setManifest((prev) => ({ ...prev, ...patch }));

  const usedKinds = new Set(manifest.tabs.filter((t) => t.kind !== "link").map((t) => t.kind));
  const addableKinds = APP_TAB_KINDS.filter((k) => !usedKinds.has(k));

  const moveTab = (index: number, delta: -1 | 1) =>
    setManifest((prev) => {
      const j = index + delta;
      if (j < 0 || j >= prev.tabs.length) return prev;
      const tabs = [...prev.tabs];
      [tabs[index], tabs[j]] = [tabs[j]!, tabs[index]!];
      return { ...prev, tabs };
    });

  const removeTab = (index: number) =>
    setManifest((prev) => ({ ...prev, tabs: prev.tabs.filter((_, i) => i !== index) }));

  const addTab = (tab: AppTab) => {
    if (manifest.tabs.length >= MAX_APP_TABS) return;
    setManifest((prev) => ({ ...prev, tabs: [...prev.tabs, tab] }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await saveAppAction({ manifest });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save");
      return;
    }
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 2000);
    router.refresh();
  };

  const publish = async (next: boolean) => {
    setPublishing(true);
    setError(null);
    // Publishing implies the current design: save first so what goes live is what's on screen.
    const saved = await saveAppAction({ manifest });
    if (!saved.ok) {
      setPublishing(false);
      setError(saved.error ?? "Could not save");
      return;
    }
    const result = await publishAppAction(next);
    setPublishing(false);
    if (!result.ok) {
      setError(result.error ?? "Could not publish");
      return;
    }
    router.refresh();
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadAppLogoAction(fd);
    setUploading(false);
    if ("error" in result) setError(result.error);
    else set({ logoUrl: result.url });
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_auto]">
      <div className="flex max-w-2xl flex-col gap-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium text-ink-secondary">
            App name <span className="text-ink-muted">(max 30)</span>
            <Input
              value={manifest.appName}
              onChange={(e) => set({ appName: e.target.value })}
              maxLength={30}
              placeholder={organizationName}
              className="mt-1 block w-64"
            />
          </label>
          <label className="text-sm font-medium text-ink-secondary">
            Theme color
            <input
              type="color"
              value={manifest.themeColor}
              onChange={(e) => set({ themeColor: e.target.value })}
              className="mt-1 block h-9 w-16 cursor-pointer rounded-md border border-border bg-surface p-1"
            />
          </label>
          <div className="text-sm font-medium text-ink-secondary">
            Logo
            <div className="mt-1 flex items-center gap-2">
              {manifest.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded logo preview
                <img src={manifest.logoUrl} alt="Logo" className="h-9 w-9 rounded-lg border border-border object-cover" />
              )}
              <label className={buttonClasses("secondary", "sm")}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {manifest.logoUrl ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        <label className="text-sm font-medium text-ink-secondary">
          Welcome message
          <Textarea
            value={manifest.welcome}
            onChange={(e) => set({ welcome: e.target.value })}
            rows={2}
            maxLength={300}
            className="mt-1 block w-full"
          />
        </label>

        <label className="text-sm font-medium text-ink-secondary">
          Giving link <span className="text-ink-muted">(your online giving page; shows a Give button)</span>
          <Input
            value={manifest.givingUrl ?? ""}
            onChange={(e) => set({ givingUrl: e.target.value || null })}
            placeholder="https://give.yourchurch.org"
            className="mt-1 block w-full"
          />
        </label>

        <div>
          <p className="text-sm font-medium text-ink-secondary">
            Tabs <span className="text-ink-muted">(what your congregation sees along the bottom)</span>
          </p>
          <div className="mt-1 flex flex-col gap-1.5">
            {manifest.tabs.map((tab, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {appTabLabel(tab)}
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    {tab.kind === "link" ? tab.url : KIND_DESCRIPTIONS[tab.kind]}
                  </span>
                </span>
                <button type="button" aria-label={`Move ${appTabLabel(tab)} up`} disabled={i === 0} onClick={() => moveTab(i, -1)} className="rounded p-1 text-ink-muted hover:bg-surface-muted disabled:opacity-30">
                  <ArrowUp size={13} />
                </button>
                <button type="button" aria-label={`Move ${appTabLabel(tab)} down`} disabled={i === manifest.tabs.length - 1} onClick={() => moveTab(i, 1)} className="rounded p-1 text-ink-muted hover:bg-surface-muted disabled:opacity-30">
                  <ArrowDown size={13} />
                </button>
                <button type="button" aria-label={`Remove ${appTabLabel(tab)}`} disabled={tab.kind === "home"} onClick={() => removeTab(i)} className="rounded p-1 text-ink-muted hover:bg-danger-bg hover:text-danger disabled:opacity-30">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {addableKinds.map((kind) => (
              <button key={kind} type="button" onClick={() => addTab({ kind })} className={buttonClasses("secondary", "sm")}>
                <Plus size={13} /> {appTabLabel({ kind })}
              </button>
            ))}
            <div className="flex items-end gap-1.5">
              <Input
                value={linkDraft.label}
                onChange={(e) => setLinkDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="Watch Live"
                maxLength={20}
                className="w-28"
              />
              <Input
                value={linkDraft.url}
                onChange={(e) => setLinkDraft((d) => ({ ...d, url: e.target.value }))}
                placeholder="https://…"
                className="w-44"
              />
              <button
                type="button"
                disabled={!linkDraft.label.trim() || !linkDraft.url.trim()}
                onClick={() => {
                  addTab({ kind: "link", label: linkDraft.label.trim(), url: linkDraft.url.trim() });
                  setLinkDraft({ label: "", url: "" });
                }}
                className={buttonClasses("secondary", "sm")}
              >
                <Plus size={13} /> Link tab
              </button>
            </div>
          </div>
        </div>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className={buttonClasses("secondary", "md")}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : savedTick ? <Check size={15} /> : null}
            {savedTick ? "Saved" : "Save design"}
          </button>
          <button type="button" onClick={() => publish(!enabled)} disabled={publishing} className={buttonClasses(enabled ? "secondary" : "primary", "md")}>
            {publishing ? <Loader2 size={15} className="animate-spin" /> : enabled ? <Globe size={15} /> : <Rocket size={15} />}
            {enabled ? "Unpublish" : "Publish app"}
          </button>
        </div>

        {enabled && installUrl && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">Your app is live 🎉</p>
            <p className="mt-1 text-sm text-ink-secondary">
              Share this link — on a phone, “Add to Home Screen” installs it like an app. Put the QR code on your
              bulletin or lobby screen.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-surface-muted px-2 py-1 text-xs text-ink">{installUrl}</code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(installUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className={buttonClasses("secondary", "sm")}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {qrSvg && (
              <div
                className="mt-3 w-36 rounded-md border border-border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                // Safe: SVG generated server-side by the qrcode library from our own URL.
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={isListed}
                onChange={async (e) => {
                  const next = e.target.checked;
                  setIsListed(next);
                  const result = await toggleAppListedAction(next);
                  if (!result.ok) {
                    setIsListed(!next);
                    setError(result.error ?? "Could not update the directory listing");
                  }
                  router.refresh();
                }}
                className="h-4 w-4 accent-current"
              />
              List in the church directory —{" "}
              <a href="/a" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-dark">
                Find your church
              </a>
            </label>
            <p className="mt-1 text-xs text-ink-muted">
              The directory is the container-app experience: one place to preview and open every published church.
              Unlisting keeps your direct link and QR code working.
            </p>
          </div>
        )}
      </div>

      {/* Live preview: the exact component the congregation's install renders. */}
      <div className="justify-self-center">
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">Live preview</p>
        <div className="h-[680px] w-[340px] overflow-hidden rounded-[2.5rem] border-[10px] border-neutral-900 bg-neutral-100 shadow-xl">
          <AppScreen
            manifest={manifest}
            organizationName={organizationName}
            content={content}
            activeIndex={Math.min(activeTab, manifest.tabs.length - 1)}
            onSelectTab={setActiveTab}
          />
        </div>
      </div>
    </div>
  );
}
