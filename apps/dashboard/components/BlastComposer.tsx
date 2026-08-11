"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import {
  createBlastAction,
  previewBlastAction,
  type BlastFormState,
} from "../app/(dashboard)/messages/actions";

/**
 * Newsletter/email composer (docs/domain/communications.md). Markdown body with a
 * live server-rendered preview (the exact HTML recipients get — the renderer
 * escapes all input, so injecting it here is safe), audience picker, and up to
 * 5 attachments / 8 MB total. Consent suppression and no-email skips happen
 * server-side and are reported on the blast detail page after sending.
 */

interface OptionItem {
  id: string;
  name: string;
}

const STATUSES = ["VISITOR", "ATTENDER", "MEMBER", "INACTIVE"];

export function BlastComposer({
  campuses,
  groups,
  people,
}: {
  campuses: OptionItem[];
  groups: OptionItem[];
  people: OptionItem[];
}) {
  const [state, formAction, pending] = useActionState<BlastFormState, FormData>(createBlastAction, { error: null });
  const [audienceKind, setAudienceKind] = useState("all");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState("");
  const [fileNote, setFileNote] = useState("");
  const latest = useRef("");

  useEffect(() => {
    latest.current = body;
    const timer = setTimeout(async () => {
      const value = body;
      if (!value.trim()) {
        setPreview("");
        return;
      }
      const result = await previewBlastAction({ markdown: value });
      if (latest.current === value) setPreview(result.html);
    }, 400);
    return () => clearTimeout(timer);
  }, [body]);

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-2">
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
              <Select name="membershipStatus" className="mt-1 block w-36" defaultValue="">
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
              <Select name="campusId" className="mt-1 block w-40" defaultValue="">
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
              <Input name="tag" placeholder="youth" className="mt-1 block w-36" />
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

        <label className="text-sm font-medium text-ink-secondary">
          Body
          <Textarea
            name="body"
            required
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"# This month at church\n\nWe are **so glad** you're part of this family.\n\n- Sunday potluck, Oct 12\n- [Volunteer signup](https://example.org)\n"}
            className="mt-1 block w-full font-mono text-xs"
          />
          <span className="mt-1 block text-xs text-ink-muted">
            Formatting: # headings, **bold**, *italic*, [links](https://…), - lists, &gt; quotes, --- dividers.
          </span>
        </label>

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
            <p className="text-sm text-ink-muted">Start typing to see how the email will look.</p>
          )}
        </div>
      </div>
    </form>
  );
}
