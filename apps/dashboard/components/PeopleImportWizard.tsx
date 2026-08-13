"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, FileSpreadsheet, Sparkles, Upload } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import type { MappingTarget, WizardColumn } from "@cms/database";
import type { PersonFieldType } from "@cms/database";
import {
  aiProposalAction,
  dryRunImportAction,
  runImportAction,
  startImportWizardAction,
  type DryRunResult,
  type RunImportResult,
  type WizardStartData,
  type WizardStartState,
} from "../app/(dashboard)/people/import/actions";

/**
 * One-question-per-screen import wizard (docs/domain/people-import.md). The client
 * only assembles answers; every payload is re-validated server-side and nothing is
 * written until the final confirm. AI is opt-in via an explicit consent screen —
 * declining keeps the whole flow local (heuristic pre-fills only).
 */

type Phase = "upload" | "aiChoice" | "questions" | "review" | "done";

type Question =
  | { kind: "column"; col: number }
  | { kind: "customType"; col: number }
  | { kind: "nameOrder"; col: number }
  | { kind: "tagDelimiter"; col: number }
  | { kind: "status"; value: string };

const TARGET_OPTIONS: { value: MappingTarget; label: string; hint?: string }[] = [
  { value: "firstName", label: "First name" },
  { value: "middleName", label: "Middle name" },
  { value: "lastName", label: "Last name" },
  { value: "suffix", label: "Suffix", hint: "Jr., Sr., III…" },
  { value: "preferredName", label: "Preferred name", hint: "The name they go by" },
  { value: "fullName", label: "Full name", hint: "We’ll split it into first + last" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "dateOfBirth", label: "Date of birth" },
  { value: "gender", label: "Gender" },
  { value: "familyPosition", label: "Family position", hint: "Father, mother, head of household, child…" },
  { value: "membershipStatus", label: "Membership status" },
  { value: "tags", label: "Tags" },
  { value: "campus", label: "Campus" },
  { value: "household", label: "Household / family", hint: "Groups these people into households" },
  { value: "custom", label: "Its own new field", hint: "Kept on the profile as a custom field" },
  { value: "ignore", label: "Don’t import this column" },
];

const FIELD_TYPE_LABELS: Record<PersonFieldType, string> = {
  TEXT: "Plain text",
  NUMBER: "A number",
  DATE: "A date",
  BOOLEAN: "Yes / No",
  SELECT: "A dropdown",
  MULTI_SELECT: "Multiple choices",
};

const STATUSES = ["VISITOR", "ATTENDER", "MEMBER", "INACTIVE"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_LABELS: Record<Status, string> = {
  VISITOR: "Visitors",
  ATTENDER: "Attenders",
  MEMBER: "Members",
  INACTIVE: "Inactive",
};

const screen = {
  initial: { opacity: 0, y: 22, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -14, scale: 0.99 },
  transition: { duration: 0.32, ease: "easeOut" as const },
};

function truncate(v: string, n = 26) {
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
}

export function PeopleImportWizard() {
  const [startState, startFormAction, starting] = useActionState<WizardStartState, FormData>(
    startImportWizardAction,
    { data: null, error: null },
  );

  const [phase, setPhase] = useState<Phase>("upload");
  const [data, setData] = useState<WizardStartData | null>(null);
  const [targets, setTargets] = useState<MappingTarget[]>([]);
  const [nameOrder, setNameOrder] = useState<"firstLast" | "lastFirst">("firstLast");
  const [tagDelimiter, setTagDelimiter] = useState<";" | "," | "|">(";");
  const [statusChoices, setStatusChoices] = useState<Record<string, Status | null>>({});
  const [customTypes, setCustomTypes] = useState<Record<number, PersonFieldType>>({});
  const [customLabels, setCustomLabels] = useState<Record<number, string>>({});
  const [usedAi, setUsedAi] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [importResult, setImportResult] = useState<RunImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [showPaste, setShowPaste] = useState(false);

  // A fresh successful upload (re)initializes the whole wizard from the server data.
  useEffect(() => {
    const d = startState.data;
    if (!d) return;
    setData(d);
    setTargets(d.guesses.map((g) => g.target));
    setNameOrder(d.guesses.find((g) => g.target === "fullName")?.nameOrder ?? "firstLast");
    const tagsIdx = d.guesses.findIndex((g) => g.target === "tags");
    setTagDelimiter(tagsIdx >= 0 ? (d.delimiters[tagsIdx] ?? ";") : ";");
    setStatusChoices({});
    // Heuristic guesses may already propose typed custom fields (the backend
    // suggested-field catalog) — seed the type/label answers from them.
    const seedTypes: Record<number, PersonFieldType> = {};
    const seedLabels: Record<number, string> = {};
    d.guesses.forEach((g, i) => {
      if (g.customField) {
        seedTypes[i] = g.customField.type;
        seedLabels[i] = g.customField.label;
      }
    });
    setCustomTypes(seedTypes);
    setCustomLabels(seedLabels);
    setUsedAi(false);
    setAiSummary("");
    setAiNote(null);
    setCursor(0);
    setDryRun(null);
    setImportResult(null);
    setPhase(d.aiAvailable ? "aiChoice" : "questions");
  }, [startState]);

  const columns: WizardColumn[] = data?.columns ?? [];

  // The question list is derived from current answers, so choosing e.g. a
  // membershipStatus column later in the flow appends its value questions.
  const questions: Question[] = [];
  if (data) {
    columns.forEach((_, i) => {
      questions.push({ kind: "column", col: i });
      // A column becoming a custom field gets its "how should this be stored?"
      // question right after — unless it reuses an existing definition, whose
      // type is fixed.
      if (targets[i] === "custom" && !data.existingFields[i]) questions.push({ kind: "customType", col: i });
    });
    const fullNameCol = targets.indexOf("fullName");
    if (fullNameCol !== -1 && !columns[fullNameCol]!.values.some((v) => v.includes(","))) {
      questions.push({ kind: "nameOrder", col: fullNameCol });
    }
    const tagsCol = targets.indexOf("tags");
    if (tagsCol !== -1) {
      const present = [";", ",", "|"].filter((d) => columns[tagsCol]!.values.some((v) => v.includes(d)));
      if (present.length >= 2) questions.push({ kind: "tagDelimiter", col: tagsCol });
    }
    const statusCol = targets.indexOf("membershipStatus");
    if (statusCol !== -1) {
      for (const v of columns[statusCol]!.values) {
        if (!STATUSES.includes(v.toUpperCase() as Status)) questions.push({ kind: "status", value: v });
      }
    }
  }

  function buildPlan() {
    if (!data) return null;
    return {
      columns: columns.map((c, i) => ({
        sourceHeader: c.header,
        target: targets[i] ?? "ignore",
        nameOrder: targets[i] === "fullName" ? nameOrder : null,
        customField:
          targets[i] === "custom"
            ? {
                key: "",
                label: customLabels[i] ?? c.header,
                type: data.existingFields[i]?.type ?? customTypes[i] ?? data.inferredTypes[i] ?? "TEXT",
              }
            : null,
      })),
      statusRules: Object.entries(statusChoices)
        .filter((entry): entry is [string, Status] => entry[1] !== null)
        .map(([sourceValue, status]) => ({ sourceValue, status })),
      tagDelimiter,
      summary: usedAi ? aiSummary : "Confirmed question-by-question in the import wizard.",
    };
  }

  // Advance only bumps the cursor; the effect below decides when questions are
  // exhausted. This matters because an answer can APPEND questions (e.g. choosing a
  // membershipStatus column on the last screen adds its value questions) and the
  // freshly computed list isn't visible inside this closure yet.
  function advance() {
    setTimeout(() => setCursor((c) => c + 1), 160);
  }

  useEffect(() => {
    if (phase === "questions" && data && questions.length > 0 && cursor >= questions.length) {
      setPhase("review");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cursor, questions.length, data]);

  function back() {
    setDryRun(null);
    if (phase === "review") {
      if (questions.length > 0) {
        setCursor(questions.length - 1);
        setPhase("questions");
      } else {
        setPhase(data?.aiAvailable ? "aiChoice" : "upload");
      }
      return;
    }
    if (cursor > 0) setCursor((c) => c - 1);
    else if (data?.aiAvailable) setPhase("aiChoice");
    else setPhase("upload");
  }

  function chooseTarget(col: number, t: MappingTarget) {
    // Single-use targets steal from a previously assigned column; any number of
    // columns may be custom fields or ignored.
    setTargets((prev) =>
      prev.map((cur, i) => (i === col ? t : t !== "ignore" && t !== "custom" && cur === t ? "ignore" : cur)),
    );
    if (t === "custom") {
      setCustomTypes((prev) => (prev[col] ? prev : { ...prev, [col]: data?.inferredTypes[col] ?? "TEXT" }));
    }
    advance();
  }

  async function chooseAi(useIt: boolean) {
    if (!data) return;
    if (!useIt) {
      setPhase("questions");
      return;
    }
    setAiLoading(true);
    const result = await aiProposalAction({ csvText: data.csvText });
    setAiLoading(false);
    if (result.ok && result.plan) {
      const byHeader = new Map(result.plan.columns.map((c) => [c.sourceHeader.toLowerCase(), c]));
      setTargets(columns.map((c) => byHeader.get(c.header.toLowerCase())?.target ?? "ignore"));
      const types: Record<number, PersonFieldType> = {};
      const labels: Record<number, string> = {};
      columns.forEach((c, i) => {
        const cf = byHeader.get(c.header.toLowerCase())?.customField;
        if (cf) {
          types[i] = cf.type;
          labels[i] = cf.label;
        }
      });
      setCustomTypes(types);
      setCustomLabels(labels);
      const full = result.plan.columns.find((c) => c.target === "fullName");
      if (full?.nameOrder) setNameOrder(full.nameOrder);
      setTagDelimiter(result.plan.tagDelimiter);
      const rules: Record<string, Status | null> = {};
      for (const r of result.plan.statusRules) rules[r.sourceValue] = r.status as Status;
      setStatusChoices(rules);
      setAiSummary(result.plan.summary);
      setUsedAi(true);
    } else {
      setAiNote("AI suggestions weren’t available just now — no problem, we’ll walk through it together.");
    }
    setPhase("questions");
  }

  // Entering review triggers the server-side dry run (validation + preview, no writes).
  const reviewRequested = useRef(false);
  useEffect(() => {
    if (phase !== "review" || !data) {
      reviewRequested.current = false;
      return;
    }
    if (reviewRequested.current) return;
    reviewRequested.current = true;
    const plan = buildPlan();
    if (!plan) return;
    setDryRun(null);
    dryRunImportAction({ csvText: data.csvText, plan }).then(setDryRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, data]);

  async function confirmImport() {
    if (!data || importing) return;
    const plan = buildPlan();
    if (!plan) return;
    setImporting(true);
    const result = await runImportAction({ csvText: data.csvText, fileName: data.fileName, plan, usedAi });
    setImporting(false);
    setImportResult(result);
    if (result.ok) setPhase("done");
  }

  function resetAll() {
    setPhase("upload");
    setData(null);
    setDryRun(null);
    setImportResult(null);
    setShowPaste(false);
  }

  const totalSteps = questions.length + 1; // + review
  const progress =
    phase === "upload" ? 0 : phase === "aiChoice" ? 6 : phase === "questions" ? 10 + (cursor / Math.max(totalSteps, 1)) * 82 : phase === "review" ? 96 : 100;

  const question = phase === "questions" ? questions[Math.min(cursor, Math.max(questions.length - 1, 0))] : undefined;

  return (
    <div className="mx-auto max-w-xl">
      {phase !== "upload" && (
        <div className="mb-8 h-1 overflow-hidden rounded-full bg-surface-muted">
          <motion.div
            className="h-full rounded-full bg-accent"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {phase === "upload" && (
          <motion.div key="upload" {...screen} className="text-center">
            <FileSpreadsheet size={34} className="mx-auto mb-5 text-accent" />
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">Let’s bring in your people.</h2>
            <p className="mx-auto mb-8 max-w-md text-sm leading-6 text-ink-secondary">
              Any spreadsheet export works — the columns don’t need to match anything. We’ll confirm what each one
              means together, one question at a time. Up to 10,000 rows per run.
            </p>
            <form action={startFormAction} className="mx-auto flex max-w-sm flex-col gap-4 text-left">
              <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-border bg-surface px-6 py-8 text-center transition-colors hover:border-accent">
                <Upload size={20} className="mx-auto mb-2 text-ink-muted" />
                <span className="block text-sm font-semibold text-ink">Choose a CSV file</span>
                <span className="mt-1 block text-xs text-ink-muted">or drop it here</span>
                <input type="file" name="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.form?.requestSubmit()} />
              </label>
              {showPaste ? (
                <>
                  <textarea
                    name="csv"
                    rows={6}
                    autoFocus
                    placeholder={"firstName,lastName,email\nDana,Whitfield,dana@example.org"}
                    className="block w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <button type="submit" disabled={starting} className={buttonClasses("primary", "lg")}>
                    {starting ? "Reading…" : "Continue"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPaste(true)}
                  className="text-center text-sm text-accent hover:underline"
                >
                  …or paste CSV text instead
                </button>
              )}
              {starting && !showPaste && <p className="text-center text-sm text-ink-muted">Reading your file…</p>}
              {startState.error && (
                <p className="rounded-md bg-danger-bg px-3 py-2 text-center text-sm text-danger">{startState.error}</p>
              )}
            </form>
          </motion.div>
        )}

        {phase === "aiChoice" && data && (
          <motion.div key="aiChoice" {...screen} className="text-center">
            <Sparkles size={30} className="mx-auto mb-5 text-accent" />
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">Want a hand matching columns?</h2>
            <p className="mx-auto mb-8 max-w-md text-sm leading-6 text-ink-secondary">
              Claude can pre-answer the questions for you by looking at your column names and a few sample values —
              with emails and phone numbers masked before anything is sent. You’ll still confirm every answer, and
              nothing is imported until the end. Or skip it and everything stays right here.
            </p>
            <div className="mx-auto flex max-w-sm flex-col gap-3">
              <button onClick={() => chooseAi(true)} disabled={aiLoading} className={buttonClasses("primary", "lg")}>
                <Sparkles size={16} /> {aiLoading ? "Analyzing your columns…" : "Use AI suggestions"}
              </button>
              <button onClick={() => chooseAi(false)} disabled={aiLoading} className={buttonClasses("secondary", "lg")}>
                No thanks — I’ll match them myself
              </button>
            </div>
          </motion.div>
        )}

        {phase === "questions" && data && question && (
          <motion.div key={`q-${cursor}`} {...screen} className="text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">
              Question {Math.min(cursor + 1, questions.length)} of {questions.length}
            </p>

            {aiNote && cursor === 0 && <p className="mx-auto mb-4 max-w-md text-xs text-ink-muted">{aiNote}</p>}

            {question.kind === "column" && (
              <ColumnQuestion
                column={columns[question.col]!}
                selected={targets[question.col] ?? "ignore"}
                suggested={usedAi}
                onPick={(t) => chooseTarget(question.col, t)}
              />
            )}

            {question.kind === "customType" && (
              <>
                <p className="mb-1 text-sm font-semibold text-accent">New field</p>
                <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">
                  How should “{truncate(customLabels[question.col] ?? columns[question.col]!.header, 26)}” be
                  displayed in your database?
                </h2>
                {columns[question.col]!.values.length > 0 && (
                  <div className="mx-auto mb-8 flex max-w-md flex-wrap justify-center gap-1.5">
                    {columns[question.col]!.values.slice(0, 5).map((v) => (
                      <span key={v} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-secondary">
                        {truncate(v)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mx-auto flex max-w-sm flex-col gap-3">
                  {(["BOOLEAN", "SELECT", "DATE", "NUMBER", "TEXT"] as const)
                    .filter((t) => t !== "SELECT" || columns[question.col]!.distinctCount <= 24)
                    .map((t) => (
                      <OptionButton
                        key={t}
                        selected={(customTypes[question.col] ?? data.inferredTypes[question.col]) === t}
                        suggested={(customTypes[question.col] ?? data.inferredTypes[question.col]) === t}
                        onClick={() => {
                          setCustomTypes((prev) => ({ ...prev, [question.col]: t }));
                          advance();
                        }}
                      >
                        {FIELD_TYPE_LABELS[t]}
                        {t === "SELECT" && (
                          <span className="ml-2 text-xs font-normal text-ink-muted">
                            {columns[question.col]!.distinctCount} choices
                          </span>
                        )}
                      </OptionButton>
                    ))}
                </div>
              </>
            )}

            {question.kind === "nameOrder" && (
              <>
                <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">Which name comes first?</h2>
                <p className="mx-auto mb-8 max-w-md text-sm text-ink-secondary">
                  In “{columns[question.col]!.header}”, a typical value looks like{" "}
                  <span className="font-semibold text-ink">“{truncate(columns[question.col]!.values[0] ?? "Dana Whitfield")}”</span>.
                </p>
                <div className="mx-auto flex max-w-sm flex-col gap-3">
                  {(["firstLast", "lastFirst"] as const).map((order) => (
                    <OptionButton
                      key={order}
                      selected={nameOrder === order}
                      onClick={() => {
                        setNameOrder(order);
                        advance();
                      }}
                    >
                      {order === "firstLast" ? "First name, then last name" : "Last name, then first name"}
                    </OptionButton>
                  ))}
                </div>
              </>
            )}

            {question.kind === "tagDelimiter" && (
              <>
                <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">How are tags separated?</h2>
                <p className="mx-auto mb-8 max-w-md text-sm text-ink-secondary">
                  For example: <span className="font-semibold text-ink">“{truncate(columns[question.col]!.values.find((v) => /[;,|]/.test(v)) ?? "", 40)}”</span>
                </p>
                <div className="mx-auto flex max-w-sm flex-col gap-3">
                  {([";", ",", "|"] as const).map((d) => (
                    <OptionButton
                      key={d}
                      selected={tagDelimiter === d}
                      onClick={() => {
                        setTagDelimiter(d);
                        advance();
                      }}
                    >
                      {d === ";" ? "Semicolons ( ; )" : d === "," ? "Commas ( , )" : "Pipes ( | )"}
                    </OptionButton>
                  ))}
                </div>
              </>
            )}

            {question.kind === "status" && (
              <>
                <p className="mb-1 text-sm font-semibold text-accent">Membership status</p>
                <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">
                  People marked “{truncate(question.value, 32)}” are…
                </h2>
                <p className="mx-auto mb-8 max-w-md text-sm text-ink-secondary">
                  Choose how this status should come into your database.
                </p>
                <div className="mx-auto flex max-w-sm flex-col gap-3">
                  {STATUSES.map((s) => (
                    <OptionButton
                      key={s}
                      selected={statusChoices[question.value] === s}
                      suggested={usedAi && statusChoices[question.value] === s}
                      onClick={() => {
                        setStatusChoices((prev) => ({ ...prev, [question.value]: s }));
                        advance();
                      }}
                    >
                      {STATUS_LABELS[s]}
                    </OptionButton>
                  ))}
                  <OptionButton
                    selected={statusChoices[question.value] === null}
                    onClick={() => {
                      setStatusChoices((prev) => ({ ...prev, [question.value]: null }));
                      advance();
                    }}
                  >
                    Not sure — flag these rows for me
                  </OptionButton>
                </div>
              </>
            )}

            <button onClick={back} className="mx-auto mt-8 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
              <ArrowLeft size={14} /> Back
            </button>
          </motion.div>
        )}

        {phase === "review" && data && (
          <motion.div key="review" {...screen} className="text-center">
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">Here’s the plan.</h2>
            <p className="mx-auto mb-6 max-w-md text-sm text-ink-secondary">
              One last look before anything is written. Nothing has been imported yet.
            </p>

            <div className="mb-4 rounded-2xl border border-border bg-surface p-4 text-left text-sm">
              <ul className="space-y-1.5">
                {columns.map((c, i) =>
                  targets[i] === "ignore" ? null : (
                    <li key={c.header} className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-ink-secondary">{truncate(c.header, 30)}</span>
                      <span className="font-semibold text-ink">
                        {targets[i] === "custom"
                          ? `${data.existingFields[i] ? "Existing" : "New"} field · ${
                              FIELD_TYPE_LABELS[
                                data.existingFields[i]?.type ?? customTypes[i] ?? data.inferredTypes[i] ?? "TEXT"
                              ]
                            }`
                          : TARGET_OPTIONS.find((t) => t.value === targets[i])?.label}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              {(dryRun?.ok && (dryRun.householdCount ?? 0) > 0) && (
                <p className="mt-3 border-t border-border pt-2 text-xs text-ink-secondary">
                  Grouping people into <span className="font-semibold text-ink">{dryRun.householdCount}</span>{" "}
                  {dryRun.householdCount === 1 ? "household" : "households"}.
                </p>
              )}
              {columns.some((_, i) => targets[i] === "ignore") && (
                <p className="mt-3 border-t border-border pt-2 text-xs text-ink-muted">
                  Not imported: {columns.filter((_, i) => targets[i] === "ignore").map((c) => c.header).join(", ")}
                </p>
              )}
            </div>

            {!dryRun && <p className="text-sm text-ink-muted">Checking every row…</p>}
            {dryRun && !dryRun.ok && (
              <div className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{dryRun.error}</div>
            )}
            {dryRun?.ok && (
              <>
                <p className="mb-4 text-sm text-ink">
                  <span className="text-2xl font-bold text-ink">{dryRun.validCount}</span>{" "}
                  {dryRun.validCount === 1 ? "person" : "people"} ready to import
                  {(dryRun.errorCount ?? 0) > 0 && (
                    <span className="text-ink-secondary"> · {dryRun.errorCount} rows need attention</span>
                  )}
                </p>
                {dryRun.preview && dryRun.preview.length > 1 && (
                  <div className="mb-4 overflow-x-auto rounded-2xl border border-border bg-surface text-left">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-ink-muted">
                          {dryRun.preview[0]!.slice(0, 5).map((h) => (
                            <th key={h} className="px-3 py-2 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dryRun.preview.slice(1).map((row, i) => (
                          <tr key={i} className="border-t border-border">
                            {row.slice(0, 5).map((cell, j) => (
                              <td key={j} className="px-3 py-1.5">
                                {truncate(cell, 24)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {dryRun.previewErrors && dryRun.previewErrors.length > 0 && (
                  <ul className="mb-4 space-y-0.5 text-left text-xs text-danger">
                    {dryRun.previewErrors.map((e) => (
                      <li key={`${e.line}-${e.message}`}>
                        Line {e.line}: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mx-auto flex max-w-sm flex-col gap-3">
                  <button onClick={confirmImport} disabled={importing || !dryRun.validCount} className={buttonClasses("primary", "lg")}>
                    <Upload size={16} />{" "}
                    {importing
                      ? "Importing…"
                      : `Import ${dryRun.validCount} ${dryRun.validCount === 1 ? "person" : "people"}`}
                  </button>
                </div>
              </>
            )}
            {importResult && !importResult.ok && (
              <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{importResult.error}</p>
            )}
            <button onClick={back} className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
              <ArrowLeft size={14} /> Back to questions
            </button>
          </motion.div>
        )}

        {phase === "done" && importResult?.ok && importResult.summary && (
          <motion.div key="done" {...screen} className="text-center">
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white"
            >
              <Check size={30} strokeWidth={3} />
            </motion.div>
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">
              Welcome, {importResult.summary.createdCount} new {importResult.summary.createdCount === 1 ? "person" : "people"}.
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-ink-secondary">
              {importResult.summary.skippedCount > 0 &&
                `${importResult.summary.skippedCount} ${importResult.summary.skippedCount === 1 ? "row was" : "rows were"} already in your database and skipped. `}
              {importResult.summary.errorCount > 0
                ? `${importResult.summary.errorCount} ${importResult.summary.errorCount === 1 ? "row" : "rows"} needed attention — details below.`
                : "Every row came through cleanly."}
            </p>
            {importResult.summary.errors.length > 0 && (
              <ul className="mx-auto mb-6 max-w-md space-y-0.5 text-left text-xs text-danger">
                {importResult.summary.errors.map((e) => (
                  <li key={`${e.line}-${e.message}`}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
                {importResult.summary.errorCount > importResult.summary.errors.length && (
                  <li className="text-ink-muted">
                    …and {importResult.summary.errorCount - importResult.summary.errors.length} more.
                  </li>
                )}
              </ul>
            )}
            <div className="mx-auto flex max-w-sm flex-col gap-3">
              <Link href="/people" className={buttonClasses("primary", "lg")}>
                Meet your people
              </Link>
              <button onClick={resetAll} className={buttonClasses("ghost", "md")}>
                Import another file
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OptionButton({
  children,
  selected,
  suggested,
  onClick,
}: {
  children: React.ReactNode;
  selected?: boolean;
  suggested?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-2xl border px-5 py-3.5 text-left text-sm font-semibold transition-all duration-150 ${
        selected
          ? "border-accent bg-accent/5 text-ink ring-1 ring-accent"
          : "border-border bg-surface text-ink hover:border-accent/60 hover:bg-surface-muted"
      }`}
    >
      <span>{children}</span>
      <span className="flex items-center gap-2">
        {suggested && selected && (
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
            <Sparkles size={11} /> Suggested
          </span>
        )}
        {selected && <Check size={16} className="text-accent" />}
      </span>
    </button>
  );
}

function ColumnQuestion({
  column,
  selected,
  suggested,
  onPick,
}: {
  column: WizardColumn;
  selected: MappingTarget;
  suggested: boolean;
  onPick: (t: MappingTarget) => void;
}) {
  return (
    <>
      <h2 className="mb-2 text-3xl font-bold tracking-tight text-ink">What’s in “{truncate(column.header, 28)}”?</h2>
      {column.values.length > 0 ? (
        <div className="mx-auto mb-8 flex max-w-md flex-wrap justify-center gap-1.5">
          {column.values.slice(0, 5).map((v) => (
            <span key={v} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-secondary">
              {truncate(v)}
            </span>
          ))}
          {column.distinctCount > 5 && (
            <span className="rounded-full px-2 py-1 text-xs text-ink-muted">+{column.distinctCount - 5} more</span>
          )}
        </div>
      ) : (
        <p className="mb-8 text-sm text-ink-muted">This column is empty in your file.</p>
      )}
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2.5">
        {TARGET_OPTIONS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onPick(t.value)}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-150 ${
              t.value === "ignore" ? "col-span-2" : ""
            } ${
              selected === t.value
                ? "border-accent bg-accent/5 text-ink ring-1 ring-accent"
                : "border-border bg-surface text-ink hover:border-accent/60 hover:bg-surface-muted"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              {t.label}
              {suggested && selected === t.value && <Sparkles size={12} className="text-accent" />}
            </span>
            {t.hint && selected === t.value && <span className="mt-0.5 block text-[11px] font-normal text-ink-muted">{t.hint}</span>}
          </button>
        ))}
      </div>
    </>
  );
}
