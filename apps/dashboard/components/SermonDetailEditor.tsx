"use client";

import { useActionState, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import type { SermonLink } from "@cms/database";
import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import { updateSermonAction, type SermonFormState } from "../app/(dashboard)/sermons/actions";

const NEW = "__new__";

function PickOrCreate({
  name,
  options,
  value,
  placeholder,
  newLabel,
}: {
  name: string;
  options: string[];
  value: string | null;
  placeholder: string;
  newLabel: string;
}) {
  const known = value !== null && options.includes(value);
  // The current value always appears in the dropdown (merged in below), so the
  // select is the default view — "+ New…" swaps to a text input on demand.
  const merged = value && !known ? [value, ...options] : options;
  const [creating, setCreating] = useState(false);
  if (creating) {
    return (
      <span className="mt-1 flex items-center gap-1.5">
        <Input name={name} defaultValue="" placeholder={placeholder} autoFocus className="block w-full" />
        <button type="button" onClick={() => setCreating(false)} className="text-xs font-medium text-accent hover:underline">
          Back
        </button>
      </span>
    );
  }
  return (
    <Select
      name={name}
      defaultValue={value ?? ""}
      className="mt-1 block w-full"
      onChange={(e) => {
        if (e.target.value === NEW) setCreating(true);
      }}
    >
      <option value="">—</option>
      {merged.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      <option value={NEW}>{newLabel}</option>
    </Select>
  );
}

/**
 * Sermon edit form (docs/domain/app.md): metadata with speaker/series
 * dropdowns (+ create-new), a real date picker, and the custom-links editor —
 * label + URL rows that render as buttons wherever the sermon appears.
 */
export function SermonDetailEditor({
  sermon,
  speakers,
  seriesList,
}: {
  sermon: {
    id: string;
    title: string;
    speaker: string | null;
    series: string | null;
    passage: string | null;
    description: string | null;
    videoUrl: string | null;
    preachedAt: string; // yyyy-mm-dd
    links: SermonLink[];
  };
  speakers: string[];
  seriesList: string[];
}) {
  const [state, formAction, pending] = useActionState<SermonFormState, FormData>(
    updateSermonAction.bind(null, sermon.id),
    { error: null }
  );
  const [links, setLinks] = useState<SermonLink[]>(sermon.links);

  return (
    <form
      action={(fd) => {
        if (fd.get("speaker") === NEW) fd.set("speaker", "");
        if (fd.get("series") === NEW) fd.set("series", "");
        formAction(fd);
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Title
        <Input name="title" required defaultValue={sermon.title} className="mt-1 block w-full" />
      </label>
      <label className="text-sm text-ink-secondary">
        Speaker
        <PickOrCreate name="speaker" options={speakers} value={sermon.speaker} placeholder="Pastor Dana" newLabel="+ New speaker…" />
      </label>
      <label className="text-sm text-ink-secondary">
        Series
        <PickOrCreate name="series" options={seriesList} value={sermon.series} placeholder="Parables" newLabel="+ New series…" />
      </label>
      <label className="text-sm text-ink-secondary">
        Passage
        <Input name="passage" defaultValue={sermon.passage ?? ""} placeholder="Luke 15:11–32" className="mt-1 block w-full" />
      </label>
      <label className="text-sm text-ink-secondary">
        Date
        <Input name="preachedAt" type="date" required defaultValue={sermon.preachedAt} className="mt-1 block w-full" />
      </label>
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Video link
        <Input name="videoUrl" defaultValue={sermon.videoUrl ?? ""} placeholder="https://youtube.com/watch?v=…" className="mt-1 block w-full" />
      </label>
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Description <span className="text-ink-muted">(optional)</span>
        <Textarea name="description" rows={3} defaultValue={sermon.description ?? ""} className="mt-1 block w-full" />
      </label>

      <div className="sm:col-span-2" data-section="sermon-links">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary">
          <Link2 size={14} /> Custom links <span className="font-normal text-ink-muted">(shown as buttons with this message)</span>
        </p>
        <div className="mt-2 space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                name="linkLabel"
                value={link.label}
                onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                placeholder="Discussion guide"
                maxLength={80}
                className="w-52"
              />
              <Input
                name="linkUrl"
                value={link.url}
                onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                placeholder="https://…"
                maxLength={1000}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
                className="p-1 text-ink-muted hover:text-danger"
                aria-label="Remove link"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {links.length < 10 && (
          <button
            type="button"
            onClick={() => setLinks([...links, { label: "", url: "" }])}
            className="mt-2 text-xs font-medium text-accent hover:underline"
            data-action="add-sermon-link"
          >
            + Add link
          </button>
        )}
      </div>

      {state.error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClasses("primary", "md")} data-action="save-sermon">
          <Plus size={15} className="hidden" /> {pending ? "Saving…" : "Save sermon"}
        </button>
      </div>
    </form>
  );
}
