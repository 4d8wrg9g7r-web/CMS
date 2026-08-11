"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Heading1,
  Image as ImageIcon,
  Loader2,
  Minus,
  MousePointerClick,
  Paperclip,
  Send,
  Trash2,
  Type,
} from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import {
  createBlastAction,
  previewBlastAction,
  uploadBlastImageAction,
  type BlastFormState,
} from "../app/(dashboard)/messages/actions";

/**
 * Block-based newsletter designer (docs/domain/communications.md). The email is
 * composed from content blocks — header images, headings, text, buttons,
 * dividers — with a live server-rendered preview (the exact HTML recipients
 * get; the renderer escapes all input, so injecting it here is safe). Audience
 * picker supports status/campus/tag/custom-field filters and can arrive
 * prefilled from the People or Reports pages. Up to 5 attachments / 8 MB total.
 */

interface OptionItem {
  id: string;
  name: string;
}

export interface AudiencePrefill {
  audienceKind?: string;
  membershipStatus?: string;
  campusId?: string;
  tag?: string;
  customFieldKey?: string;
  customFieldValue?: string;
}

const STATUSES = ["VISITOR", "ATTENDER", "MEMBER", "INACTIVE"];

/** Client-side block draft: a server EmailBlock plus a stable local id. */
interface DraftBlock {
  localId: number;
  type: "image" | "heading" | "text" | "button" | "divider";
  url?: string;
  alt?: string;
  text?: string;
  level?: 1 | 2;
  markdown?: string;
  label?: string;
  uploading?: boolean;
  uploadError?: string;
}

/** Blocks complete enough to render/send; incomplete drafts stay client-side. */
function serializeBlocks(drafts: DraftBlock[]) {
  const blocks = [];
  for (const d of drafts) {
    if (d.type === "image" && d.url) blocks.push({ type: "image", url: d.url, alt: d.alt ?? "" });
    else if (d.type === "heading" && d.text?.trim()) blocks.push({ type: "heading", text: d.text, level: d.level ?? 1 });
    else if (d.type === "text" && d.markdown?.trim()) blocks.push({ type: "text", markdown: d.markdown });
    else if (d.type === "button" && d.label?.trim() && d.url?.trim()) blocks.push({ type: "button", label: d.label, url: d.url });
    else if (d.type === "divider") blocks.push({ type: "divider" });
  }
  return blocks;
}

let nextLocalId = 1;

export function BlastComposer({
  campuses,
  groups,
  people,
  fieldKeys,
  prefill,
}: {
  campuses: OptionItem[];
  groups: OptionItem[];
  people: OptionItem[];
  fieldKeys: string[];
  prefill?: AudiencePrefill;
}) {
  const [state, formAction, pending] = useActionState<BlastFormState, FormData>(createBlastAction, { error: null });
  const [audienceKind, setAudienceKind] = useState(prefill?.audienceKind ?? "all");
  const [blocks, setBlocks] = useState<DraftBlock[]>([
    { localId: nextLocalId++, type: "heading", text: "", level: 1 },
    { localId: nextLocalId++, type: "text", markdown: "" },
  ]);
  const [preview, setPreview] = useState("");
  const [fileNote, setFileNote] = useState("");
  const serialized = JSON.stringify(serializeBlocks(blocks));
  const latest = useRef("");

  useEffect(() => {
    latest.current = serialized;
    const timer = setTimeout(async () => {
      const value = serialized;
      if (value === "[]") {
        setPreview("");
        return;
      }
      const result = await previewBlastAction({ blocks: JSON.parse(value) });
      if (latest.current === value) setPreview(result.html);
    }, 400);
    return () => clearTimeout(timer);
  }, [serialized]);

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
    setBlocks((prev) => [...prev, { localId: nextLocalId++, type, ...(type === "heading" ? { level: 2 as const } : {}) }]);

  const uploadImage = async (localId: number, file: File) => {
    update(localId, { uploading: true, uploadError: undefined });
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadBlastImageAction(fd);
    if ("error" in result) update(localId, { uploading: false, uploadError: result.error });
    else update(localId, { uploading: false, url: result.url, alt: file.name.replace(/\.[a-z0-9]+$/i, "") });
  };

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-2">
      <input type="hidden" name="blocks" value={serialized} />
      <div className="flex flex-col gap-4">
        <label className="text-sm font-medium text-ink-secondary">
          To
          <Select
            name="audienceKind"
            value={audienceKind}
            onChange={(e) => setAudienceKind(e.target.value)}
            className="mt-1 block w-full"
          >
            <option value="all">Everyone with an email address</option>
            <option value="filter">A filtered audience</option>
            <option value="group">A group</option>
            <option value="people">Specific people</option>
          </Select>
        </label>

        {audienceKind === "filter" && (
          <div className="flex flex-wrap gap-3 rounded-md border border-border bg-surface-muted p-3">
            <label className="text-sm text-ink-secondary">
              Status
              <Select name="membershipStatus" className="mt-1 block w-36" defaultValue={prefill?.membershipStatus ?? ""}>
                <option value="">Any</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm text-ink-secondary">
              Campus
              <Select name="campusId" className="mt-1 block w-40" defaultValue={prefill?.campusId ?? ""}>
                <option value="">Any</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm text-ink-secondary">
              Tag
              <Input name="tag" placeholder="youth" className="mt-1 block w-36" defaultValue={prefill?.tag ?? ""} />
            </label>
            <label className="text-sm text-ink-secondary">
              Custom field
              <Select name="customFieldKey" className="mt-1 block w-40" defaultValue={prefill?.customFieldKey ?? ""}>
                <option value="">None</option>
                {fieldKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm text-ink-secondary">
              Field value
              <Input
                name="customFieldValue"
                placeholder="Yes"
                className="mt-1 block w-36"
                defaultValue={prefill?.customFieldValue ?? ""}
              />
            </label>
          </div>
        )}

        {audienceKind === "group" && (
          <label className="text-sm text-ink-secondary">
            Group
            <Select name="groupId" className="mt-1 block w-full" defaultValue="">
              <option value="">Choose a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </label>
        )}

        {audienceKind === "people" && (
          <label className="text-sm text-ink-secondary">
            People <span className="text-ink-muted">(Ctrl/Cmd-click for several)</span>
            <select
              name="personIds"
              multiple
              size={8}
              className="mt-1 block w-full rounded-sm border border-border bg-surface px-2 py-1 text-sm text-ink"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="text-sm font-medium text-ink-secondary">
          Subject
          <Input name="subject" required placeholder="October newsletter" className="mt-1 block w-full" />
        </label>

        <div>
          <p className="text-sm font-medium text-ink-secondary">Content blocks</p>
          <div className="mt-1 flex flex-col gap-2">
            {blocks.map((block, i) => (
              <div key={block.localId} className="rounded-md border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {block.type === "image" ? "Image" : block.type === "heading" ? "Heading" : block.type === "text" ? "Text" : block.type === "button" ? "Button" : "Divider"}
                  </span>
                  <span className="flex items-center gap-1">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(block.localId, -1)} className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => move(block.localId, 1)} className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30">
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
                      // eslint-disable-next-line @next/next/no-img-element -- remote upload URL preview
                      <img src={block.url} alt={block.alt ?? ""} className="max-h-40 w-full rounded-md object-cover" />
                    ) : (
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadImage(block.localId, file);
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
                      <Input
                        placeholder="Describe the image (alt text)"
                        value={block.alt ?? ""}
                        onChange={(e) => update(block.localId, { alt: e.target.value })}
                        className="block w-full text-xs"
                      />
                    )}
                  </div>
                )}

                {block.type === "heading" && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Section heading"
                      value={block.text ?? ""}
                      onChange={(e) => update(block.localId, { text: e.target.value })}
                      className="block w-full font-semibold"
                    />
                    <Select
                      value={String(block.level ?? 1)}
                      onChange={(e) => update(block.localId, { level: e.target.value === "2" ? 2 : 1 })}
                      className="w-24"
                    >
                      <option value="1">Large</option>
                      <option value="2">Small</option>
                    </Select>
                  </div>
                )}

                {block.type === "text" && (
                  <div>
                    <Textarea
                      rows={5}
                      placeholder={"We are **so glad** you're part of this family.\n\n- Sunday potluck, Oct 12\n- [Volunteer signup](https://example.org)"}
                      value={block.markdown ?? ""}
                      onChange={(e) => update(block.localId, { markdown: e.target.value })}
                      className="block w-full font-mono text-xs"
                    />
                    <span className="mt-1 block text-xs text-ink-muted">
                      **bold**, *italic*, [links](https://…), - lists, &gt; quotes.
                    </span>
                  </div>
                )}

                {block.type === "button" && (
                  <div className="flex flex-wrap gap-2">
                    <Input
                      placeholder="Button label (RSVP now)"
                      value={block.label ?? ""}
                      onChange={(e) => update(block.localId, { label: e.target.value })}
                      className="block w-44"
                    />
                    <Input
                      placeholder="https://example.org/rsvp"
                      value={block.url ?? ""}
                      onChange={(e) => update(block.localId, { url: e.target.value })}
                      className="block min-w-52 flex-1"
                    />
                  </div>
                )}

                {block.type === "divider" && <div className="border-t border-border" />}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => add("image")} className={buttonClasses("secondary", "sm")}>
              <ImageIcon size={14} /> Image
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
        </div>

        <label className="text-sm font-medium text-ink-secondary">
          Attachments <span className="text-ink-muted">(up to 5 files, 8 MB total)</span>
          <input
            type="file"
            name="attachments"
            multiple
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              setFileNote(files.length ? files.map((f) => f.name).join(", ") : "");
            }}
            className="mt-1 block w-full text-sm text-ink-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-muted"
          />
          {fileNote && (
            <span className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <Paperclip size={12} /> {fileNote}
            </span>
          )}
        </label>

        {state.error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}

        <div>
          <button type="submit" disabled={pending} className={buttonClasses("primary", "md")}>
            <Send size={15} /> {pending ? "Sending…" : "Send email"}
          </button>
          <p className="mt-2 text-xs text-ink-muted">
            People who opted out of email are skipped automatically (and shown as suppressed afterward).
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-ink-secondary">Preview</p>
        <div className="rounded-lg border border-border bg-white p-5">
          {preview ? (
            // Safe: previewBlastAction output comes from our escaping renderer —
            // arbitrary input HTML can never survive into this string.
            <div dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <p className="text-sm text-ink-muted">Fill in a block to see how the email will look.</p>
          )}
        </div>
      </div>
    </form>
  );
}
