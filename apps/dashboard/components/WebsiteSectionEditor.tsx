"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, ExternalLink, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import type { SiteSection, SiteSectionKind } from "@cms/database";
import {
  blankSectionUi as blankSection,
  SECTION_KINDS_UI as SECTION_KINDS,
  SECTION_KIND_LABELS_UI as SECTION_KIND_LABELS,
} from "../lib/site-sections-ui";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Input, Select, Textarea } from "./ui/Input";
import { useToast } from "./ui/Toast";
import { updateSitePageAction, uploadSiteImageAction } from "../app/(dashboard)/website/actions";

/**
 * The Website studio page editor (docs/domain/website.md): a canvas +
 * inspector. The canvas is the REAL public page in an iframe (studio mode) —
 * clicking a section there selects it here; the inspector carries the section
 * list and one per-kind form. Saving re-renders the live preview. Live kinds
 * (events/sermons/groups) only need a title + count because their content
 * comes from the CMS at render time.
 */

interface Props {
  pageId: string;
  pageTitle: string;
  previewUrl: string;
  initialSections: SiteSection[];
  /** Full-screen studio chrome (/studio/website): canvas+inspector fill the viewport. */
  fullScreen?: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      {children}
    </div>
  );
}

function CtaListEditor({
  ctas,
  onChange,
}: {
  ctas: { label: string; href: string }[];
  onChange: (ctas: { label: string; href: string }[]) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-secondary">Buttons</p>
      <div className="space-y-2">
        {ctas.map((cta, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={cta.label}
              onChange={(e) => onChange(ctas.map((c, j) => (j === i ? { ...c, label: e.target.value } : c)))}
              placeholder="Plan a Visit"
              className="flex-1"
              maxLength={60}
            />
            <Input
              value={cta.href}
              onChange={(e) => onChange(ctas.map((c, j) => (j === i ? { ...c, href: e.target.value } : c)))}
              placeholder="/plan-a-visit or https://…"
              className="flex-1"
              maxLength={500}
            />
            <button className="p-1 text-ink-muted hover:text-danger" onClick={() => onChange(ctas.filter((_, j) => j !== i))} aria-label="Remove button">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {ctas.length < 3 ? (
        <button className="mt-1.5 text-xs font-medium text-accent hover:underline" onClick={() => onChange([...ctas, { label: "", href: "" }])}>
          + Add button
        </button>
      ) : null}
    </div>
  );
}

/** Hidden-file-input upload button; errors surface as toasts. */
function UploadImageButton({ onUploaded, compact }: { onUploaded: (url: string) => void; compact?: boolean }) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const pick = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadSiteImageAction(formData).catch(() => ({ error: "Upload failed — try again." as const }));
    setUploading(false);
    if ("url" in result) onUploaded(result.url);
    else showToast(result.error, "error");
  };
  return (
    <label
      className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface text-xs font-medium text-ink-secondary transition-colors duration-180 hover:border-border-strong hover:text-ink ${
        compact ? "p-1.5" : "px-2.5 py-2"
      }`}
      title="Upload image"
    >
      {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
      {compact ? null : "Upload"}
      <input
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        data-action="upload-image"
        disabled={uploading}
        onChange={(e) => {
          void pick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Image URL input + upload + live thumbnail, for section image fields. */
function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      <div className="flex items-center gap-2">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/uploaded URLs
          <img src={value} alt="" data-testid="image-field-thumb" className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
        ) : null}
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or upload" maxLength={1000} className="flex-1" />
        <UploadImageButton onUploaded={onChange} />
      </div>
    </div>
  );
}

function SectionFields({ section, onChange }: { section: SiteSection; onChange: (s: SiteSection) => void }) {
  switch (section.kind) {
    case "hero":
      return (
        <div className="space-y-3">
          <Field label="Headline">
            <Input value={section.headline} onChange={(e) => onChange({ ...section, headline: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Subheadline">
            <Input value={section.subheadline} onChange={(e) => onChange({ ...section, subheadline: e.target.value })} maxLength={300} />
          </Field>
          <ImageField label="Background image (optional)" value={section.imageUrl} onChange={(imageUrl) => onChange({ ...section, imageUrl })} />
          <CtaListEditor ctas={section.ctas} onChange={(ctas) => onChange({ ...section, ctas })} />
        </div>
      );
    case "serviceTimes":
      return (
        <div className="space-y-2">
          <Field label="Title">
            <Input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} maxLength={120} />
          </Field>
          <p className="text-xs text-ink-muted">Times come from Site settings on the Website page.</p>
        </div>
      );
    case "textImage":
      return (
        <div className="space-y-3">
          <Field label="Title">
            <Input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Body">
            <Textarea value={section.body} onChange={(e) => onChange({ ...section, body: e.target.value })} rows={4} />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <ImageField label="Image (optional)" value={section.imageUrl} onChange={(imageUrl) => onChange({ ...section, imageUrl })} />
            <Field label="Image side">
              <Select value={section.imageSide} onChange={(e) => onChange({ ...section, imageSide: e.target.value === "left" ? "left" : "right" })}>
                <option value="right">Right</option>
                <option value="left">Left</option>
              </Select>
            </Field>
          </div>
        </div>
      );
    case "cardGrid":
      return (
        <div className="space-y-3">
          <Field label="Title">
            <Input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} maxLength={200} />
          </Field>
          <div className="space-y-2">
            {section.cards.map((card, i) => (
              <div key={i} className="rounded-sm border border-border p-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Input
                    value={card.title}
                    onChange={(e) => onChange({ ...section, cards: section.cards.map((c, j) => (j === i ? { ...c, title: e.target.value } : c)) })}
                    placeholder="Card title"
                    className="flex-1"
                    maxLength={120}
                  />
                  <button
                    className="p-1 text-ink-muted hover:text-danger"
                    onClick={() => onChange({ ...section, cards: section.cards.filter((_, j) => j !== i) })}
                    aria-label="Remove card"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <Textarea
                  value={card.body}
                  onChange={(e) => onChange({ ...section, cards: section.cards.map((c, j) => (j === i ? { ...c, body: e.target.value } : c)) })}
                  placeholder="Card text"
                  rows={2}
                  className="mb-1.5"
                />
                <Input
                  value={card.href}
                  onChange={(e) => onChange({ ...section, cards: section.cards.map((c, j) => (j === i ? { ...c, href: e.target.value } : c)) })}
                  placeholder="Link (optional): /plan-a-visit or https://…"
                  maxLength={500}
                />
              </div>
            ))}
          </div>
          {section.cards.length < 12 ? (
            <button
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => onChange({ ...section, cards: [...section.cards, { title: "", body: "", href: "" }] })}
            >
              + Add card
            </button>
          ) : null}
        </div>
      );
    case "events":
    case "sermons":
    case "groups":
      return (
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <Field label="Title">
            <Input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Show up to">
            <Input
              type="number"
              min={1}
              max={12}
              value={section.limit}
              onChange={(e) => onChange({ ...section, limit: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
            />
          </Field>
        </div>
      );
    case "give":
    case "visit":
      return (
        <div className="space-y-3">
          <Field label="Title">
            <Input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Body">
            <Textarea value={section.body} onChange={(e) => onChange({ ...section, body: e.target.value })} rows={3} />
          </Field>
        </div>
      );
    case "cta":
      return (
        <div className="space-y-3">
          <Field label="Title">
            <Input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Body">
            <Textarea value={section.body} onChange={(e) => onChange({ ...section, body: e.target.value })} rows={3} />
          </Field>
          <CtaListEditor ctas={section.ctas} onChange={(ctas) => onChange({ ...section, ctas })} />
        </div>
      );
    case "team":
      return (
        <div className="space-y-3">
          <Field label="Title">
            <Input value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} maxLength={120} />
          </Field>
          <div className="space-y-2">
            {section.people.map((person, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={person.name}
                  onChange={(e) => onChange({ ...section, people: section.people.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)) })}
                  placeholder="Name"
                  className="flex-1"
                  maxLength={120}
                />
                <Input
                  value={person.role}
                  onChange={(e) => onChange({ ...section, people: section.people.map((p, j) => (j === i ? { ...p, role: e.target.value } : p)) })}
                  placeholder="Role"
                  className="flex-1"
                  maxLength={120}
                />
                <Input
                  value={person.imageUrl}
                  onChange={(e) => onChange({ ...section, people: section.people.map((p, j) => (j === i ? { ...p, imageUrl: e.target.value } : p)) })}
                  placeholder="Photo URL"
                  className="flex-1"
                  maxLength={1000}
                />
                <UploadImageButton
                  compact
                  onUploaded={(url) => onChange({ ...section, people: section.people.map((p, j) => (j === i ? { ...p, imageUrl: url } : p)) })}
                />
                <button
                  className="p-1 text-ink-muted hover:text-danger"
                  onClick={() => onChange({ ...section, people: section.people.filter((_, j) => j !== i) })}
                  aria-label="Remove person"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          {section.people.length < 24 ? (
            <button
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => onChange({ ...section, people: [...section.people, { name: "", role: "", imageUrl: "" }] })}
            >
              + Add person
            </button>
          ) : null}
        </div>
      );
    case "markdown":
      return (
        <Field label="Text (paragraphs, and lines starting with “- ” become bullets)">
          <Textarea value={section.body} onChange={(e) => onChange({ ...section, body: e.target.value })} rows={6} />
        </Field>
      );
    default:
      return null;
  }
}

export function WebsiteSectionEditor({ pageId, pageTitle, previewUrl, initialSections, fullScreen }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [sections, setSections] = useState<SiteSection[]>(initialSections);
  const [selected, setSelected] = useState<number | null>(initialSections.length > 0 ? 0 : null);
  const [addKind, setAddKind] = useState<SiteSectionKind>("hero");
  const [dirty, setDirty] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);

  // The live preview is the real public page in studio mode: clicking a
  // section there posts its index back up, selecting it in the inspector.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; index?: number };
      if (data?.type === "cms:select-section" && typeof data.index === "number") {
        setSelected(data.index);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const update = (index: number, section: SiteSection) => {
    setSections((s) => s.map((x, i) => (i === index ? section : x)));
    setDirty(true);
  };
  const move = (index: number, direction: -1 | 1) => {
    setSections((s) => {
      const next = [...s];
      const target = index + direction;
      if (target < 0 || target >= next.length) return s;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
    setSelected((sel) => (sel === index ? index + direction : sel));
    setDirty(true);
  };
  const remove = (index: number) => {
    setSections((s) => s.filter((_, i) => i !== index));
    setSelected((sel) => (sel === index ? null : sel !== null && sel > index ? sel - 1 : sel));
    setDirty(true);
  };
  const duplicate = (index: number) => {
    setSections((s) => {
      const next = [...s];
      next.splice(index + 1, 0, JSON.parse(JSON.stringify(next[index])) as SiteSection);
      return next;
    });
    setSelected(index + 1);
    setDirty(true);
  };

  const save = () => {
    startTransition(async () => {
      const result = await updateSitePageAction({ pageId, sections });
      if (result.ok) {
        setDirty(false);
        showToast("Page saved", "success");
        setPreviewNonce((n) => n + 1); // reload the live preview
        router.refresh();
      } else {
        showToast(result.error ?? "Could not save the page", "error");
      }
    });
  };

  const studioSrc = `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}studio=1&v=${previewNonce}`;
  const selectedSection = selected !== null ? sections[selected] : undefined;

  return (
    <div className={fullScreen ? "grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]" : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]"}>
      {/* Canvas: the real page, live. Click a section to edit it. */}
      <div className={fullScreen ? "flex min-h-0 min-w-0 flex-col" : "min-w-0"}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            Click any section in the preview to edit it.
            {dirty ? " Unsaved changes — the preview updates when you save." : ""}
          </p>
          <div className="flex items-center gap-2.5">
            <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-dark">
              Open page <ExternalLink size={13} />
            </a>
            <Button size="sm" onClick={save} disabled={isPending || !dirty} data-action="save-page">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null} {dirty ? "Save page" : "Saved"}
            </Button>
          </div>
        </div>
        <iframe
          key={previewNonce}
          src={studioSrc}
          title={`Preview of ${pageTitle}`}
          data-testid="studio-preview"
          className={
            fullScreen
              ? "min-h-0 w-full flex-1 rounded-xl border border-border bg-white shadow-panel"
              : "h-[calc(100vh-230px)] min-h-[480px] w-full rounded-xl border border-border bg-white shadow-panel"
          }
        />
      </div>

      {/* Inspector: section list + the selected section's controls. */}
      <div className={`flex min-w-0 flex-col gap-4 ${fullScreen ? "min-h-0 overflow-y-auto pr-1" : ""}`} data-section="studio-inspector">
        <Card padding="sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Sections</p>
          {sections.length === 0 ? (
            <p className="py-2 text-sm text-ink-muted">No sections yet — add the first one below.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sections.map((section, index) => (
                <li key={index} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={selected === index}
                    onClick={() => setSelected(index)}
                    className={`flex-1 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 ${
                      selected === index ? "bg-surface-warm font-semibold text-accent" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
                    }`}
                    data-inspector-item={section.kind}
                  >
                    {SECTION_KIND_LABELS[section.kind]}
                  </button>
                  <button className="p-1 text-ink-muted hover:text-ink disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move section up">
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="p-1 text-ink-muted hover:text-ink disabled:opacity-30"
                    disabled={index === sections.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move section down"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button className="p-1 text-ink-muted hover:text-ink" onClick={() => duplicate(index)} aria-label="Duplicate section" title="Duplicate">
                    <Copy size={13} />
                  </button>
                  <button className="p-1 text-ink-muted hover:text-danger" onClick={() => remove(index)} aria-label="Remove section">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Select value={addKind} onChange={(e) => setAddKind(e.target.value as SiteSectionKind)} className="flex-1 py-2 text-sm" aria-label="Section kind">
              {SECTION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {SECTION_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSections((s) => [...s, blankSection(addKind)]);
                setSelected(sections.length);
                setDirty(true);
              }}
              data-action="add-section"
            >
              <Plus size={14} /> Add
            </Button>
          </div>
        </Card>

        {selectedSection !== undefined && selected !== null ? (
          <Card padding="sm" data-editor-section={selectedSection.kind}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {SECTION_KIND_LABELS[selectedSection.kind]}
            </p>
            <SectionFields section={selectedSection} onChange={(s) => update(selected, s)} />
          </Card>
        ) : (
          <Card padding="md">
            <p className="text-center text-sm text-ink-muted">Select a section — in the preview or the list — to edit it.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
