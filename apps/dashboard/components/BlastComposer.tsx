"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Heading1,
  Image as ImageIcon,
  Loader2,
  Minus,
  MousePointerClick,
  Paperclip,
  Send,
  Trash2,
  Type,
  Users2,
} from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import {
  createBlastAction,
  estimateAudienceAction,
  previewBlastAction,
  uploadBlastImageAction,
  type BlastFormState,
} from "../app/(dashboard)/messages/actions";

/**
 * The guided composer (docs/design-system.md; brief: Audience → Message →
 * Review → Send). One form the whole way — every step stays mounted (hidden,
 * not unmounted) so nothing typed is ever lost — with a live recipient
 * estimate on the Audience step that uses the exact resolution path the send
 * uses. The email itself is composed from content blocks with a
 * server-rendered preview (the escaping renderer makes injection impossible).
 * Audience prefills still arrive from the People and Reports pages.
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
  groupId?: string;
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

const AUDIENCE_KINDS: { value: string; label: string; hint: string }[] = [
  { value: "all", label: "Everyone", hint: "Every person with an email address" },
  { value: "filter", label: "A filtered audience", hint: "Status, campus, tag, or a custom field" },
  { value: "group", label: "A group", hint: "Members of one group" },
  { value: "people", label: "Specific people", hint: "Hand-pick up to 500 recipients" },
];

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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stepError, setStepError] = useState<string | null>(null);

  // Audience state is controlled so the live estimate always matches the form.
  const [audienceKind, setAudienceKind] = useState(prefill?.audienceKind ?? "all");
  const [status, setStatus] = useState(prefill?.membershipStatus ?? "");
  const [campusId, setCampusId] = useState(prefill?.campusId ?? "");
  const [tag, setTag] = useState(prefill?.tag ?? "");
  const [customKey, setCustomKey] = useState(prefill?.customFieldKey ?? "");
  const [customValue, setCustomValue] = useState(prefill?.customFieldValue ?? "");
  const [groupId, setGroupId] = useState(prefill?.groupId ?? "");
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [estimate, setEstimate] = useState<{ count: number; noEmailCount: number } | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<DraftBlock[]>([
    { localId: nextLocalId++, type: "heading", text: "", level: 1 },
    { localId: nextLocalId++, type: "text", markdown: "" },
  ]);
  const [preview, setPreview] = useState("");
  const [fileNote, setFileNote] = useState("");
  const serialized = JSON.stringify(serializeBlocks(blocks));
  const latest = useRef("");

  // Debounced live preview of the composed blocks.
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

  // Debounced recipient estimate whenever the audience changes.
  const audienceSignature = JSON.stringify({ audienceKind, status, campusId, tag, customKey, customValue, groupId, personIds });
  const latestAudience = useRef("");
  useEffect(() => {
    latestAudience.current = audienceSignature;
    if ((audienceKind === "group" && !groupId) || (audienceKind === "people" && personIds.length === 0)) {
      setEstimate(null);
      return;
    }
    setEstimating(true);
    const timer = setTimeout(async () => {
      const signature = audienceSignature;
      const result = await estimateAudienceAction({
        kind: audienceKind,
        membershipStatus: status,
        campusId,
        tag,
        customFieldKey: customKey,
        customFieldValue: customValue,
        groupId,
        personIds,
      }).catch(() => null);
      if (latestAudience.current !== signature) return;
      setEstimating(false);
      setEstimate(result && result.ok ? { count: result.count, noEmailCount: result.noEmailCount } : null);
    }, 350);
    return () => clearTimeout(timer);
  }, [audienceSignature, audienceKind, status, campusId, tag, customKey, customValue, groupId, personIds]);

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

  const audienceLabel = () => {
    if (audienceKind === "all") return "Everyone with an email address";
    if (audienceKind === "group") return `Group: ${groups.find((g) => g.id === groupId)?.name ?? "—"}`;
    if (audienceKind === "people") return `${personIds.length} hand-picked ${personIds.length === 1 ? "person" : "people"}`;
    const parts = [
      status && `status ${status.charAt(0) + status.slice(1).toLowerCase()}`,
      campusId && `campus ${campuses.find((c) => c.id === campusId)?.name ?? ""}`,
      tag && `tag “${tag}”`,
      customKey && customValue && `${customKey} = ${customValue}`,
    ].filter(Boolean);
    return parts.length ? `Filtered: ${parts.join(", ")}` : "Filtered: everyone (no filters set)";
  };

  const goNext = () => {
    setStepError(null);
    if (step === 1) {
      if (audienceKind === "group" && !groupId) return setStepError("Choose a group first.");
      if (audienceKind === "people" && personIds.length === 0) return setStepError("Pick at least one person.");
      setStep(2);
    } else if (step === 2) {
      if (!subject.trim()) return setStepError("Give the email a subject.");
      if (serialized === "[]") return setStepError("Add at least one content block.");
      setStep(3);
    }
  };

  const STEPS = [
    { n: 1 as const, label: "Audience" },
    { n: 2 as const, label: "Message" },
    { n: 3 as const, label: "Review & send" },
  ];

  return (
    <form action={formAction} className="mx-auto max-w-5xl">
      <input type="hidden" name="blocks" value={serialized} />

      {/* Stepper — previous steps are clickable, future steps are not. */}
      <ol className="mb-8 flex items-center gap-2" data-section="composer-steps">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-8 bg-border-strong" />}
            <button
              type="button"
              disabled={s.n > step}
              onClick={() => s.n < step && setStep(s.n)}
              aria-current={s.n === step ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm transition-colors duration-180 ${
                s.n === step
                  ? "bg-surface font-semibold text-ink shadow-panel"
                  : s.n < step
                    ? "text-ink-secondary hover:text-ink"
                    : "cursor-default text-ink-muted"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  s.n < step ? "bg-success text-white" : s.n === step ? "bg-accent text-white" : "bg-black/[0.06] text-ink-muted"
                }`}
              >
                {s.n < step ? <Check size={13} /> : s.n}
              </span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      {/* ------------------------- Step 1: Audience ------------------------- */}
      <div className={step === 1 ? "" : "hidden"} data-step="audience">
        <h2 className="mb-1 text-xl font-semibold tracking-tight text-ink">Who should receive this?</h2>
        <p className="mb-5 text-sm text-ink-secondary">People who opted out of email are skipped automatically.</p>

        <div className="mb-5 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Audience">
          {AUDIENCE_KINDS.map((kind) => (
            <label
              key={kind.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors duration-150 ${
                audienceKind === kind.value ? "border-accent bg-surface shadow-panel" : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <input
                type="radio"
                name="audienceKind"
                value={kind.value}
                checked={audienceKind === kind.value}
                onChange={() => setAudienceKind(kind.value)}
                className="mt-1"
              />
              <span>
                <span className="block text-[15px] font-semibold text-ink">{kind.label}</span>
                <span className="block text-sm text-ink-muted">{kind.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className={audienceKind === "filter" ? "mb-5 flex flex-wrap gap-3 rounded-md border border-border bg-surface-muted p-4" : "hidden"}>
          <label className="text-sm text-ink-secondary">
            Status
            <Select name="membershipStatus" value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block w-36">
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
            <Select name="campusId" value={campusId} onChange={(e) => setCampusId(e.target.value)} className="mt-1 block w-40">
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
            <Input name="tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="youth" className="mt-1 block w-36" />
          </label>
          <label className="text-sm text-ink-secondary">
            Custom field
            <Select name="customFieldKey" value={customKey} onChange={(e) => setCustomKey(e.target.value)} className="mt-1 block w-40">
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
            <Input name="customFieldValue" value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="Yes" className="mt-1 block w-36" />
          </label>
        </div>

        <label className={audienceKind === "group" ? "mb-5 block text-sm text-ink-secondary" : "hidden"}>
          Group
          <Select name="groupId" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="mt-1 block w-full max-w-md">
            <option value="">Choose a group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </label>

        <label className={audienceKind === "people" ? "mb-5 block text-sm text-ink-secondary" : "hidden"}>
          People <span className="text-ink-muted">(Ctrl/Cmd-click for several)</span>
          <select
            name="personIds"
            multiple
            size={8}
            onChange={(e) => setPersonIds([...e.target.selectedOptions].map((o) => o.value))}
            className="mt-1 block w-full max-w-md rounded border border-border-strong bg-surface px-2 py-1 text-sm text-ink"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* The number that makes the step feel real. */}
        <div className="mb-6 flex items-center gap-3 rounded-md border border-border bg-surface px-5 py-4 shadow-panel" data-section="recipient-estimate">
          <Users2 size={18} className="text-accent" />
          {estimating ? (
            <span className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 size={14} className="animate-spin" /> Counting…
            </span>
          ) : estimate ? (
            <span className="text-[15px] text-ink">
              Estimated recipients: <span className="text-metric text-lg">{estimate.count.toLocaleString()}</span>
              {estimate.noEmailCount > 0 && (
                <span className="ml-2 text-sm text-ink-muted">({estimate.noEmailCount} without an email are skipped)</span>
              )}
            </span>
          ) : (
            <span className="text-sm text-ink-muted">Finish choosing an audience to see the count.</span>
          )}
        </div>
      </div>

      {/* ------------------------- Step 2: Message ------------------------- */}
      <div className={step === 2 ? "grid gap-6 lg:grid-cols-2" : "hidden"} data-step="message">
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium text-ink-secondary">
            Subject
            <Input
              name="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="October newsletter"
              className="mt-1 block w-full"
            />
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
      </div>

      {/* ---------------------- Step 3: Review & send ---------------------- */}
      <div className={step === 3 ? "" : "hidden"} data-step="review">
        <h2 className="mb-5 text-xl font-semibold tracking-tight text-ink">Ready to send?</h2>
        <div className="mb-6 grid gap-4 rounded-lg border border-border bg-surface p-6 shadow-panel sm:grid-cols-3" data-section="review-summary">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">To</p>
            <p className="mt-1 text-[15px] text-ink">{audienceLabel()}</p>
            {estimate && (
              <p className="mt-0.5 text-sm text-ink-secondary">
                ~{estimate.count.toLocaleString()} {estimate.count === 1 ? "recipient" : "recipients"}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Subject</p>
            <p className="mt-1 truncate text-[15px] text-ink">{subject || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Attachments</p>
            <p className="mt-1 truncate text-[15px] text-ink">{fileNote || "None"}</p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-border bg-white p-5">
          {preview ? (
            <div dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <p className="text-sm text-ink-muted">Nothing to preview yet.</p>
          )}
        </div>
      </div>

      {(stepError || state.error) && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{stepError ?? state.error}</p>
      )}

      {/* Footer controls */}
      <div className="flex items-center justify-between border-t border-border pt-5">
        {step > 1 ? (
          <button type="button" onClick={() => setStep((s) => (s === 3 ? 2 : 1))} className={buttonClasses("ghost", "sm")}>
            <ArrowLeft size={15} /> Back
          </button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <button type="button" onClick={goNext} className={buttonClasses("primary", "md")} data-action="composer-next">
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <div className="text-right">
            <button type="submit" disabled={pending} className={buttonClasses("primary", "md")} data-action="composer-send">
              <Send size={15} /> {pending ? "Sending…" : "Send email"}
            </button>
            <p className="mt-2 text-xs text-ink-muted">
              People who opted out of email are skipped automatically (and shown as suppressed afterward).
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
