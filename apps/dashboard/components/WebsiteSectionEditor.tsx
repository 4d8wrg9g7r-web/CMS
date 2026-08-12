"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
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
import { updateSitePageAction } from "../app/(dashboard)/website/actions";

/**
 * Per-page section editor (docs/domain/website.md): every block kind gets its
 * own small form; live kinds (events/sermons/groups) only need a title + count
 * because their content comes from the CMS at render time. Order with the
 * arrows, save the whole page at once, preview on the public route.
 */

interface Props {
  pageId: string;
  pageTitle: string;
  previewUrl: string;
  initialSections: SiteSection[];
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
          <Field label="Background image URL (optional)">
            <Input value={section.imageUrl} onChange={(e) => onChange({ ...section, imageUrl: e.target.value })} placeholder="https://…" maxLength={1000} />
          </Field>
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
            <Field label="Image URL (optional)">
              <Input value={section.imageUrl} onChange={(e) => onChange({ ...section, imageUrl: e.target.value })} placeholder="https://…" maxLength={1000} />
            </Field>
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

export function WebsiteSectionEditor({ pageId, pageTitle, previewUrl, initialSections }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [sections, setSections] = useState<SiteSection[]>(initialSections);
  const [addKind, setAddKind] = useState<SiteSectionKind>("hero");
  const [dirty, setDirty] = useState(false);

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
    setDirty(true);
  };
  const remove = (index: number) => {
    setSections((s) => s.filter((_, i) => i !== index));
    setDirty(true);
  };

  const save = () => {
    startTransition(async () => {
      const result = await updateSitePageAction({ pageId, sections });
      if (result.ok) {
        setDirty(false);
        showToast("Page saved", "success");
        router.refresh();
      } else {
        showToast(result.error ?? "Could not save the page", "error");
      }
    });
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          View this page <ExternalLink size={13} />
        </a>
        <Button size="sm" onClick={save} disabled={isPending || !dirty} data-action="save-page">
          {isPending ? <Loader2 size={14} className="animate-spin" /> : null} {dirty ? "Save page" : "Saved"}
        </Button>
      </div>

      <div className="space-y-3">
        {sections.map((section, index) => (
          <Card key={index} padding="sm" data-editor-section={section.kind}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{SECTION_KIND_LABELS[section.kind]}</p>
              <div className="flex items-center gap-1">
                <button className="p-1 text-ink-muted hover:text-ink disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move section up">
                  <ArrowUp size={14} />
                </button>
                <button
                  className="p-1 text-ink-muted hover:text-ink disabled:opacity-30"
                  disabled={index === sections.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move section down"
                >
                  <ArrowDown size={14} />
                </button>
                <button className="p-1 text-ink-muted hover:text-danger" onClick={() => remove(index)} aria-label="Remove section">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <SectionFields section={section} onChange={(s) => update(index, s)} />
          </Card>
        ))}
        {sections.length === 0 ? (
          <Card padding="md">
            <p className="py-4 text-center text-sm text-ink-muted">No sections yet — add the first one below.</p>
          </Card>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Select value={addKind} onChange={(e) => setAddKind(e.target.value as SiteSectionKind)} className="w-56" aria-label="Section kind">
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
            setDirty(true);
          }}
          data-action="add-section"
        >
          <Plus size={14} /> Add section
        </Button>
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Editing “{pageTitle}” — changes go live on the public site as soon as you save (if the site is published).
      </p>
    </div>
  );
}
