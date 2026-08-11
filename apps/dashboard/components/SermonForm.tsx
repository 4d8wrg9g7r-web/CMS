"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Input, Textarea } from "./ui/Input";
import { createSermonAction, type SermonFormState } from "../app/(dashboard)/sermons/actions";

/** Inline add-a-sermon form (docs/domain/app.md) — metadata + external video link. */
export function SermonForm() {
  const [state, formAction, pending] = useActionState<SermonFormState, FormData>(createSermonAction, { error: null });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
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
        <Input name="speaker" placeholder="Pastor Dana" className="mt-1 block w-40" />
      </label>
      <label className="text-sm text-ink-secondary">
        Series
        <Input name="series" placeholder="Parables" className="mt-1 block w-36" />
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
