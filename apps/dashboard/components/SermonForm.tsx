"use client";

import { useActionState, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import { createSermonAction, type SermonFormState } from "../app/(dashboard)/sermons/actions";

const NEW = "__new__";

/**
 * Speaker/series pick from what already exists (no retyping, no typo-forked
 * series) with a "+ New…" option that swaps in a text input — that's the
 * Create-series flow. Both submit under the same form field name either way.
 */
function PickOrCreate({
  name,
  options,
  placeholder,
  newLabel,
  width,
}: {
  name: string;
  options: string[];
  placeholder: string;
  newLabel: string;
  width: string;
}) {
  // ALWAYS start as a dropdown — even with nothing to pick yet, the
  // "+ New…" option is how the create flow stays discoverable.
  const [creating, setCreating] = useState(false);
  if (creating) {
    return (
      <span className="mt-1 flex items-center gap-1.5">
        <Input name={name} placeholder={placeholder} autoFocus className={`block ${width}`} />
        <button
          type="button"
          onClick={() => setCreating(false)}
          className="text-xs font-medium text-accent hover:underline"
          aria-label="Back to the list"
        >
          Back
        </button>
      </span>
    );
  }
  return (
    <Select
      name={name}
      defaultValue=""
      className={`mt-1 block ${width}`}
      onChange={(e) => {
        if (e.target.value === NEW) setCreating(true);
      }}
    >
      <option value="">—</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      <option value={NEW}>{newLabel}</option>
    </Select>
  );
}

/** Inline add-a-sermon form (docs/domain/app.md) — metadata + external video link. */
export function SermonForm({ speakers = [], seriesList = [] }: { speakers?: string[]; seriesList?: string[] }) {
  const [state, formAction, pending] = useActionState<SermonFormState, FormData>(createSermonAction, { error: null });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        // The "+ New…" sentinel must never persist as a value.
        if (fd.get("speaker") === NEW) fd.set("speaker", "");
        if (fd.get("series") === NEW) fd.set("series", "");
        formAction(fd);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="text-sm text-ink-secondary">
        Title
        <Input name="title" required placeholder="The Prodigal Son" className="mt-1 block w-56" />
      </label>
      <label className="text-sm text-ink-secondary">
        Speaker
        <PickOrCreate name="speaker" options={speakers} placeholder="Pastor Dana" newLabel="+ New speaker…" width="w-44" />
      </label>
      <label className="text-sm text-ink-secondary">
        Series
        <PickOrCreate name="series" options={seriesList} placeholder="Parables" newLabel="+ New series…" width="w-40" />
      </label>
      <label className="text-sm text-ink-secondary">
        Passage
        <Input name="passage" placeholder="Luke 15:11–32" className="mt-1 block w-36" />
      </label>
      <label className="text-sm text-ink-secondary">
        Date
        <Input name="preachedAt" type="date" required className="mt-1 block w-40" />
      </label>
      <label className="text-sm text-ink-secondary">
        Video link
        <Input name="videoUrl" placeholder="https://youtube.com/watch?v=…" className="mt-1 block w-64" />
      </label>
      <label className="w-full text-sm text-ink-secondary">
        Description <span className="text-ink-muted">(optional)</span>
        <Textarea name="description" rows={2} className="mt-1 block w-full" />
      </label>
      {state.error && <p className="w-full rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={buttonClasses("primary", "md")}>
        <Plus size={15} /> {pending ? "Saving…" : "Add sermon"}
      </button>
    </form>
  );
}
