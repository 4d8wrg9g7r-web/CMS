"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, FilePlus2, Heading1, ImagePlus, Loader2, Minus, MousePointerClick, Trash2, Type } from "lucide-react";
import type { AppLinkTarget, AppPageBlock, AppTabKind } from "@cms/database";
import { APP_TAB_KINDS_UI, appTabLabelUi } from "../lib/app-manifest-ui";
import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import { PageBlocksView } from "./church-app/PageBlocksView";
import {
  archivePageAction,
  createPageAction,
  updatePageAction,
  uploadPageGraphicAction,
} from "../app/(dashboard)/app-studio/actions";

/**
 * Custom-pages builder (docs/domain/app.md): the church designs its own app
 * screens — graphics (optionally clickable), headings, text, buttons — with
 * every link targeting an app tab, an in-app link, or the external browser.
 * The preview on the right renders the exact PageBlocksView the app uses.
 */

interface PageItem {
  id: string;
  title: string;
  blocks: AppPageBlock[];
}

/** Draft link target with a stable editing shape. */
interface DraftTarget {
  kind: "none" | "tab" | "inapp" | "external";
  tab: AppTabKind;
  url: string;
}

interface DraftBlock {
  localId: number;
  type: AppPageBlock["type"];
  url?: string;
  alt?: string;
  text?: string;
  label?: string;
  target: DraftTarget;
  uploading?: boolean;
  uploadError?: string;
}

const NO_TARGET: DraftTarget = { kind: "none", tab: "home", url: "" };

let nextId = 1;

function toDraft(blocks: AppPageBlock[]): DraftBlock[] {
  return blocks.map((b) => {
    const target = (t: AppLinkTarget | null | undefined): DraftTarget =>
      !t ? NO_TARGET : t.kind === "tab" ? { kind: "tab", tab: t.tab, url: "" } : { kind: t.kind, tab: "home", url: t.url };
    switch (b.type) {
      case "image":
        return { localId: nextId++, type: "image", url: b.url, alt: b.alt, target: target(b.link) };
      case "heading":
        return { localId: nextId++, type: "heading", text: b.text, target: NO_TARGET };
      case "text":
        return { localId: nextId++, type: "text", text: b.text, target: NO_TARGET };
      case "button":
        return { localId: nextId++, type: "button", label: b.label, target: target(b.target) };
      case "divider":
        return { localId: nextId++, type: "divider", target: NO_TARGET };
    }
  });
}

function fromDraftTarget(t: DraftTarget): AppLinkTarget | null {
  if (t.kind === "tab") return { kind: "tab", tab: t.tab };
  if (t.kind === "inapp" && t.url.trim()) return { kind: "inapp", url: t.url.trim() };
  if (t.kind === "external" && t.url.trim()) return { kind: "external", url: t.url.trim() };
  return null;
}

function serialize(drafts: DraftBlock[]): AppPageBlock[] {
  const blocks: AppPageBlock[] = [];
  for (const d of drafts) {
    if (d.type === "image" && d.url) blocks.push({ type: "image", url: d.url, alt: d.alt ?? "", link: fromDraftTarget(d.target) });
    else if (d.type === "heading" && d.text?.trim()) blocks.push({ type: "heading", text: d.text.trim() });
    else if (d.type === "text" && d.text?.trim()) blocks.push({ type: "text", text: d.text.trim() });
    else if (d.type === "button" && d.label?.trim()) {
      const target = fromDraftTarget(d.target);
      if (target) blocks.push({ type: "button", label: d.label.trim(), target });
    } else if (d.type === "divider") blocks.push({ type: "divider" });
  }
  return blocks;
}

function TargetEditor({ draft, onChange, allowNone }: { draft: DraftTarget; onChange: (t: DraftTarget) => void; allowNone: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={draft.kind}
        onChange={(e) => onChange({ ...draft, kind: e.target.value as DraftTarget["kind"] })}
        className="w-40 text-xs"
      >
        {allowNone && <option value="none">No link</option>}
        <option value="tab">Open an app tab</option>
        <option value="inapp">Open in app</option>
        <option value="external">External browser</option>
      </Select>
      {draft.kind === "tab" && (
        <Select value={draft.tab} onChange={(e) => onChange({ ...draft, tab: e.target.value as AppTabKind })} className="w-32 text-xs">
          {APP_TAB_KINDS_UI.map((kind) => (
            <option key={kind} value={kind}>
              {appTabLabelUi({ kind })}
            </option>
          ))}
        </Select>
      )}
      {(draft.kind === "inapp" || draft.kind === "external") && (
        <Input
          value={draft.url}
          onChange={(e) => onChange({ ...draft, url: e.target.value })}
          placeholder="https://…"
          className="w-56 text-xs"
        />
      )}
    </div>
  );
}

export function PagesStudio({ initialPages, themeColor }: { initialPages: PageItem[]; themeColor: string }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | "new" | null>(initialPages[0]?.id ?? "new");
  const selected = initialPages.find((p) => p.id === selectedId) ?? null;
  const [title, setTitle] = useState(selected?.title ?? "");
  const [blocks, setBlocks] = useState<DraftBlock[]>(selected ? toDraft(selected.blocks) : []);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const select = (id: string | "new") => {
    const page = initialPages.find((p) => p.id === id) ?? null;
    setSelectedId(id);
    setTitle(page?.title ?? "");
    setBlocks(page ? toDraft(page.blocks) : []);
    setError(null);
  };

  const update = (localId: number, patch: Partial<DraftBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.localId === localId ? { ...b, ...patch } : b)));
  const remove = (localId: number) => setBlocks((prev) => prev.filter((b) => b.localId !== localId));
  const move = (localId: number, delta: -1 | 1) =>
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.localId === localId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const add = (type: DraftBlock["type"]) =>
    setBlocks((prev) => [...prev, { localId: nextId++, type, target: type === "button" ? { ...NO_TARGET, kind: "external" } : NO_TARGET }]);

  const uploadGraphic = async (localId: number, file: File) => {
    update(localId, { uploading: true, uploadError: undefined });
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadPageGraphicAction(fd);
    if ("error" in result) update(localId, { uploading: false, uploadError: result.error });
    else update(localId, { uploading: false, url: result.url });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = { title, blocks: serialize(blocks) };
    let ok: boolean;
    let saveError: string | undefined;
    if (selectedId === "new" || !selectedId) {
      const result = await createPageAction(payload);
      ok = result.ok;
      saveError = result.error;
      if (result.ok && result.pageId) setSelectedId(result.pageId);
    } else {
      const result = await updatePageAction({ pageId: selectedId, ...payload });
      ok = result.ok;
      saveError = result.error;
    }
    setSaving(false);
    if (!ok) {
      setError(saveError ?? "Could not save");
      return;
    }
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 2000);
    router.refresh();
  };

  const serialized = serialize(blocks);

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_auto]">
      <div className="flex max-w-2xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {initialPages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => select(page.id)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${
                selectedId === page.id ? "border-accent text-accent" : "border-border text-ink hover:bg-surface-muted"
              }`}
            >
              {page.title}
            </button>
          ))}
          <button
            type="button"
            onClick={() => select("new")}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${
              selectedId === "new" ? "border-accent text-accent" : "border-border text-ink hover:bg-surface-muted"
            }`}
          >
            <FilePlus2 size={13} /> New page
          </button>
        </div>

        <label className="text-sm font-medium text-ink-secondary">
          Page title
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="Plan Your Visit" className="mt-1 block w-64" />
        </label>

        <div className="flex flex-col gap-2">
          {blocks.map((block, i) => (
            <div key={block.localId} className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {block.type === "image" ? "Graphic" : block.type}
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(block.localId, -1)} className="rounded p-1 text-ink-muted hover:bg-surface-muted disabled:opacity-30">
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => move(block.localId, 1)} className="rounded p-1 text-ink-muted hover:bg-surface-muted disabled:opacity-30">
                    <ArrowDown size={13} />
                  </button>
                  <button type="button" aria-label="Remove block" onClick={() => remove(block.localId)} className="rounded p-1 text-ink-muted hover:bg-danger-bg hover:text-danger">
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>

              {block.type === "image" && (
                <div className="flex flex-col gap-2">
                  {block.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded graphic preview
                    <img src={block.url} alt={block.alt ?? ""} className="max-h-40 w-full rounded-md object-cover" />
                  ) : (
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadGraphic(block.localId, file);
                      }}
                      className="block w-full text-sm text-ink-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-muted"
                    />
                  )}
                  {block.uploading && (
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <Loader2 size={12} className="animate-spin" /> Uploading…
                    </span>
                  )}
                  {block.uploadError && <span className="text-xs text-danger">{block.uploadError}</span>}
                  {block.url && (
                    <>
                      <Input
                        placeholder="Describe the graphic (alt text)"
                        value={block.alt ?? ""}
                        onChange={(e) => update(block.localId, { alt: e.target.value })}
                        className="block w-full text-xs"
                      />
                      <TargetEditor draft={block.target} onChange={(target) => update(block.localId, { target })} allowNone />
                    </>
                  )}
                </div>
              )}

              {block.type === "heading" && (
                <Input
                  placeholder="Section heading"
                  value={block.text ?? ""}
                  onChange={(e) => update(block.localId, { text: e.target.value })}
                  maxLength={120}
                  className="block w-full font-semibold"
                />
              )}

              {block.type === "text" && (
                <Textarea
                  rows={3}
                  placeholder="We meet Sundays at 10am…"
                  value={block.text ?? ""}
                  onChange={(e) => update(block.localId, { text: e.target.value })}
                  maxLength={2000}
                  className="block w-full"
                />
              )}

              {block.type === "button" && (
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Button label (Get directions)"
                    value={block.label ?? ""}
                    onChange={(e) => update(block.localId, { label: e.target.value })}
                    maxLength={40}
                    className="block w-56"
                  />
                  <TargetEditor draft={block.target} onChange={(target) => update(block.localId, { target })} allowNone={false} />
                </div>
              )}

              {block.type === "divider" && <div className="border-t border-border" />}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => add("image")} className={buttonClasses("secondary", "sm")}>
            <ImagePlus size={14} /> Graphic
          </button>
          <button type="button" onClick={() => add("heading")} className={buttonClasses("secondary", "sm")}>
            <Heading1 size={14} /> Heading
          </button>
          <button type="button" onClick={() => add("text")} className={buttonClasses("secondary", "sm")}>
            <Type size={14} /> Text
          </button>
          <button type="button" onClick={() => add("button")} className={buttonClasses("secondary", "sm")}>
            <MousePointerClick size={14} /> Button
          </button>
          <button type="button" onClick={() => add("divider")} className={buttonClasses("secondary", "sm")}>
            <Minus size={14} /> Divider
          </button>
        </div>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving || !title.trim()} className={buttonClasses("primary", "md")}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : savedTick ? <Check size={15} /> : null}
            {savedTick ? "Saved" : selectedId === "new" ? "Create page" : "Save page"}
          </button>
          {selected && (
            <button
              type="button"
              onClick={async () => {
                await archivePageAction(selected.id);
                select("new");
                router.refresh();
              }}
              className={buttonClasses("secondary", "md")}
            >
              <Trash2 size={15} /> Archive
            </button>
          )}
        </div>
      </div>

      <div className="justify-self-center">
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">Page preview</p>
        <div className="h-[680px] w-[340px] overflow-y-auto rounded-[2.5rem] border-[10px] border-neutral-900 bg-neutral-100 p-4">
          {serialized.length === 0 ? (
            <p className="pt-10 text-center text-sm text-neutral-500">Add blocks to see the page.</p>
          ) : (
            <PageBlocksView blocks={serialized} accent={themeColor} resolveTarget={() => null} />
          )}
        </div>
      </div>
    </div>
  );
}
