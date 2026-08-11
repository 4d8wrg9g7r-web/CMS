"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, FileDown, Loader2, Sparkles, Trash2 } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Input, Select } from "./ui/Input";
import { ReportBarChart, ReportLineChart, ReportRoundChart, ReportTable, type ChartSeries } from "./report-charts";
import type { CompareMode, ReportChart, ReportMeasure, ReportSource } from "@cms/database";
import {
  askReportAiAction,
  deleteSavedReportAction,
  runReportAction,
  saveReportAction,
  type RunReportResult,
} from "../app/(dashboard)/reports/actions";

/**
 * The report builder (docs/domain/reports.md): pick a source, dates, grouping,
 * measure, and chart; results re-run automatically. The config this assembles is
 * plain JSON — validated and permission-checked server-side on every run. PDF
 * export is the browser's print dialog over a print-clean layout (shell chrome
 * carries print:hidden).
 */

interface OptionItem {
  id: string;
  name: string;
}
interface CustomFieldOption {
  key: string;
  label: string;
  type: string;
  options: string[];
}
export interface SavedReportItem {
  id: string;
  name: string;
  config: unknown;
}

const DATE_PRESETS = [
  { value: "thisYear", label: "This year" },
  { value: "last90", label: "Last 90 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastYear", label: "Last year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const;
type DatePreset = (typeof DATE_PRESETS)[number]["value"];

const SOURCE_LABELS: Record<ReportSource, string> = {
  people: "People",
  attendance: "Attendance",
  giving: "Giving",
};

const MEASURE_LABELS: Record<ReportMeasure, string> = {
  count: "Count",
  uniquePeople: "Unique people",
  sumAmount: "Total amount",
};

const STATUSES = ["VISITOR", "ATTENDER", "MEMBER", "INACTIVE"] as const;

function presetRange(preset: DatePreset): { from: string | null; to: string | null } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const y = now.getUTCFullYear();
  switch (preset) {
    case "thisYear":
      return { from: `${y}-01-01`, to: iso(now) };
    case "lastYear":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "thisMonth":
      return { from: `${y}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`, to: iso(now) };
    case "last30":
      return { from: iso(new Date(now.getTime() - 30 * 86400000)), to: iso(now) };
    case "last90":
      return { from: iso(new Date(now.getTime() - 90 * 86400000)), to: iso(now) };
    case "all":
      return { from: null, to: null };
    case "custom":
      return { from: null, to: null };
  }
}

function formatCentsClient(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

export function ReportBuilder({
  allowedSources,
  campuses,
  funds,
  events,
  customFields,
  savedReports,
  aiAvailable,
}: {
  allowedSources: ReportSource[];
  campuses: OptionItem[];
  funds: OptionItem[];
  events: OptionItem[];
  customFields: CustomFieldOption[];
  savedReports: SavedReportItem[];
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [source, setSource] = useState<ReportSource>(allowedSources[0] ?? "people");
  const [preset, setPreset] = useState<DatePreset>("thisYear");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [group, setGroup] = useState<string>("time:month");
  const [measure, setMeasure] = useState<ReportMeasure>("count");
  // Over-time reports read best as lines, so that's the default.
  const [chart, setChart] = useState<ReportChart>("line");
  const [compare, setCompare] = useState<CompareMode | "">("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<{ question: string; explanation: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [campusId, setCampusId] = useState("");
  const [fundId, setFundId] = useState("");
  const [method, setMethod] = useState("");
  const [eventId, setEventId] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<RunReportResult | null>(null);
  const [running, startRunning] = useTransition();

  const measures: ReportMeasure[] =
    source === "people" ? ["count"] : source === "attendance" ? ["count", "uniquePeople"] : ["sumAmount", "count", "uniquePeople"];

  function buildConfig() {
    const range = preset === "custom" ? { from: from || null, to: to || null } : presetRange(preset);
    return {
      source,
      from: range.from,
      to: range.to,
      groupBy: group.startsWith("time:")
        ? { kind: "time", bucket: group.slice(5) }
        : { kind: "dimension", field: group.slice(4) },
      measure,
      chart,
      compare: range.from && range.to && compare ? compare : null,
      filters: {
        membershipStatus: status || null,
        campusId: campusId || null,
        fundId: fundId || null,
        method: method || null,
        eventId: eventId || null,
        customFieldKey: customKey || null,
        customFieldValue: customValue || null,
      },
    };
  }

  // Auto-run (debounced) whenever any control changes.
  const configJson = JSON.stringify(buildConfig());
  const latest = useRef(configJson);
  useEffect(() => {
    latest.current = configJson;
    const timer = setTimeout(() => {
      startRunning(async () => {
        const res = await runReportAction({ config: JSON.parse(configJson) });
        if (latest.current === configJson) setResult(res);
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configJson]);

  function changeSource(next: ReportSource) {
    setSource(next);
    setGroup("time:month");
    setChart("line");
    setMeasure(next === "giving" ? "sumAmount" : "count");
    setFundId("");
    setMethod("");
    setEventId("");
  }

  // Time series read as lines; category comparisons as bars. Donut/table choices stick.
  function changeGroup(next: string) {
    setGroup(next);
    if (chart === "line" || chart === "bar") setChart(next.startsWith("time:") ? "line" : "bar");
  }

  function applyConfig(config: unknown) {
    const c = config as ReturnType<typeof buildConfig>;
    if (!c || typeof c !== "object") return;
    if (!allowedSources.includes(c.source)) return;
    setSource(c.source);
    setPreset("custom");
    setFrom(c.from ?? "");
    setTo(c.to ?? "");
    setGroup(c.groupBy.kind === "time" ? `time:${c.groupBy.bucket}` : `dim:${c.groupBy.field}`);
    setMeasure(c.measure);
    setChart(c.chart);
    setStatus(c.filters?.membershipStatus ?? "");
    setCampusId(c.filters?.campusId ?? "");
    setFundId(c.filters?.fundId ?? "");
    setMethod(c.filters?.method ?? "");
    setEventId(c.filters?.eventId ?? "");
    setCustomKey(c.filters?.customFieldKey ?? "");
    setCustomValue(c.filters?.customFieldValue ?? "");
    setCompare((c.compare as CompareMode | null) ?? "");
  }

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setAiError(null);
    const res = await askReportAiAction({ question: q, currentConfig: buildConfig() });
    setAsking(false);
    if (!res.ok || !res.config) {
      setAiError(res.error ?? "The assistant is unavailable right now");
      return;
    }
    applyConfig(res.config);
    setAiAnswer({ question: q, explanation: res.explanation ?? "" });
    setQuestion("");
  }

  async function save() {
    setSaveError(null);
    const res = await saveReportAction({ name: saveName, config: buildConfig() });
    if (!res.ok) {
      setSaveError(res.error ?? "Could not save");
      return;
    }
    setSaveName("");
    router.refresh();
  }

  const filterCustomField = customFields.find((f) => f.key === customKey);
  const format = (n: number) => (measure === "sumAmount" ? formatCentsClient(n) : n.toLocaleString("en-US"));
  const groups = result?.ok ? (result.groups ?? []) : [];

  return (
    <div>
      {savedReports.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Saved</span>
          {savedReports.map((item) => (
            <span key={item.id} className="flex items-center overflow-hidden rounded-full border border-border bg-surface text-sm">
              <button onClick={() => applyConfig(item.config)} className="px-3 py-1 font-medium text-ink hover:bg-surface-muted">
                {item.name}
              </button>
              <button
                onClick={async () => {
                  await deleteSavedReportAction(item.id);
                  router.refresh();
                }}
                aria-label={`Delete saved report ${item.name}`}
                className="pr-2 text-ink-muted hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {aiAvailable && (
        <div className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-panel print:hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <Sparkles size={16} className="shrink-0 text-accent" />
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder='Ask for a report — "giving by fund last quarter", "how many veterans attended this year?"'
              className="min-w-64 flex-1"
            />
            <button type="submit" disabled={asking || !question.trim()} className={buttonClasses("primary", "sm")}>
              {asking ? <Loader2 size={14} className="animate-spin" /> : "Ask"}
            </button>
          </form>
          <p className="mt-2 text-xs text-ink-muted">
            Closed AI: only your question and your field/fund/campus names go to Claude — it builds the report
            settings, and the numbers are computed entirely inside your database. No records ever leave your system.
          </p>
          {aiError && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{aiError}</p>}
          {aiAnswer && (
            <div className="mt-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
              <p className="text-xs font-medium text-ink-muted">“{aiAnswer.question}”</p>
              <p className="mt-0.5 text-ink-secondary">{aiAnswer.explanation}</p>
            </div>
          )}
        </div>
      )}

      {/* Controls: one row of primary choices, one row of filters. */}
      <div className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-panel print:hidden">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-secondary">
            Source
            <Select value={source} onChange={(e) => changeSource(e.target.value as ReportSource)} className="mt-1 block w-36">
              {allowedSources.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm text-ink-secondary">
            Dates
            <Select value={preset} onChange={(e) => setPreset(e.target.value as DatePreset)} className="mt-1 block w-40">
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
          {preset === "custom" && (
            <>
              <label className="text-sm text-ink-secondary">
                From
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-40" />
              </label>
              <label className="text-sm text-ink-secondary">
                To
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-40" />
              </label>
            </>
          )}
          <label className="text-sm text-ink-secondary">
            Group by
            <Select value={group} onChange={(e) => changeGroup(e.target.value)} className="mt-1 block w-52">
              <option value="time:week">Over time — weekly</option>
              <option value="time:month">Over time — monthly</option>
              <option value="time:year">Over time — yearly</option>
              <option value="dim:membershipStatus">By membership status</option>
              <option value="dim:campus">By campus</option>
              {source === "attendance" && <option value="dim:event">By event</option>}
              {source === "giving" && <option value="dim:fund">By fund</option>}
              {source === "giving" && <option value="dim:method">By method</option>}
              {customFields.map((f) => (
                <option key={f.key} value={`dim:custom:${f.key}`}>
                  By {f.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm text-ink-secondary">
            Measure
            <Select value={measure} onChange={(e) => setMeasure(e.target.value as ReportMeasure)} className="mt-1 block w-40">
              {measures.map((m) => (
                <option key={m} value={m}>
                  {MEASURE_LABELS[m]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm text-ink-secondary">
            Chart
            <Select value={chart} onChange={(e) => setChart(e.target.value as ReportChart)} className="mt-1 block w-32">
              <option value="bar">Bars</option>
              <option value="line">Line</option>
              <option value="pie">Pie</option>
              <option value="donut">Donut</option>
              <option value="table">Table only</option>
            </Select>
          </label>
          <label className="text-sm text-ink-secondary">
            Compare
            <Select
              value={preset === "all" ? "" : compare}
              onChange={(e) => setCompare(e.target.value as CompareMode | "")}
              disabled={preset === "all"}
              className="mt-1 block w-44"
              title={preset === "all" ? "Comparisons need a bounded date range" : undefined}
            >
              <option value="">No comparison</option>
              <option value="previousYear">vs same period last year</option>
              <option value="previousPeriod">vs previous period</option>
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <label className="text-sm text-ink-secondary">
            Status
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block w-32">
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </label>
          {campuses.length > 0 && (
            <label className="text-sm text-ink-secondary">
              Campus
              <Select value={campusId} onChange={(e) => setCampusId(e.target.value)} className="mt-1 block w-40">
                <option value="">Any</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {source === "giving" && (
            <>
              <label className="text-sm text-ink-secondary">
                Fund
                <Select value={fundId} onChange={(e) => setFundId(e.target.value)} className="mt-1 block w-40">
                  <option value="">Any</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm text-ink-secondary">
                Method
                <Select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 block w-36">
                  <option value="">Any</option>
                  {["CASH", "CHECK", "CARD", "ACH", "OTHER"].map((m) => (
                    <option key={m} value={m}>
                      {m.charAt(0) + m.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </label>
            </>
          )}
          {source === "attendance" && events.length > 0 && (
            <label className="text-sm text-ink-secondary">
              Event
              <Select value={eventId} onChange={(e) => setEventId(e.target.value)} className="mt-1 block w-48">
                <option value="">Any</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {customFields.length > 0 && (
            <>
              <label className="text-sm text-ink-secondary">
                Field filter
                <Select
                  value={customKey}
                  onChange={(e) => {
                    setCustomKey(e.target.value);
                    setCustomValue("");
                  }}
                  className="mt-1 block w-44"
                >
                  <option value="">None</option>
                  {customFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </label>
              {filterCustomField && (
                <label className="text-sm text-ink-secondary">
                  Value
                  {filterCustomField.type === "BOOLEAN" ? (
                    <Select value={customValue} onChange={(e) => setCustomValue(e.target.value)} className="mt-1 block w-28">
                      <option value="">Choose…</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </Select>
                  ) : filterCustomField.options.length > 0 ? (
                    <Select value={customValue} onChange={(e) => setCustomValue(e.target.value)} className="mt-1 block w-40">
                      <option value="">Choose…</option>
                      {filterCustomField.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input value={customValue} onChange={(e) => setCustomValue(e.target.value)} className="mt-1 block w-40" />
                  )}
                </label>
              )}
            </>
          )}
          <div className="ml-auto flex items-end gap-2">
            <label className="text-sm text-ink-secondary">
              Save as
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Giving by fund, YTD"
                className="mt-1 block w-44"
              />
            </label>
            <button onClick={save} disabled={!saveName.trim()} className={buttonClasses("secondary", "sm")}>
              <BookmarkPlus size={14} /> Save
            </button>
            <button onClick={() => window.print()} className={buttonClasses("secondary", "sm")}>
              <FileDown size={14} /> Download PDF
            </button>
          </div>
        </div>
        {saveError && <p className="mt-2 text-sm text-danger">{saveError}</p>}
      </div>

      {/* Results */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-panel">
        {running && (
          <p className="mb-3 flex items-center gap-2 text-sm text-ink-muted print:hidden">
            <Loader2 size={14} className="animate-spin" /> Running…
          </p>
        )}
        {result && !result.ok && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{result.error}</p>
        )}
        {result?.ok &&
          (() => {
            const series: ChartSeries[] = [
              { label: result.primaryLabel ?? "Current", groups },
              ...(result.comparison ? [{ label: result.comparison.label, groups: result.comparison.groups }] : []),
            ];
            const totals = [result.total ?? 0, ...(result.comparison ? [result.comparison.total] : [])];
            const changePct =
              result.comparison && result.comparison.total > 0
                ? (((result.total ?? 0) - result.comparison.total) / result.comparison.total) * 100
                : null;
            return (
              <>
                <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <p className="text-3xl font-bold tracking-tight text-ink">{format(result.total ?? 0)}</p>
                  <p className="text-sm text-ink-secondary">
                    {MEASURE_LABELS[result.measure ?? "count"]} · {result.rowCount?.toLocaleString("en-US")} records
                  </p>
                  {result.comparison && (
                    <p className="text-sm text-ink-secondary">
                      vs {result.comparison.label}: <span className="tabular-nums">{format(result.comparison.total)}</span>
                      {changePct !== null && (
                        <span className={`ml-1.5 font-semibold ${changePct >= 0 ? "text-success" : "text-danger"}`}>
                          {changePct >= 0 ? "+" : ""}
                          {changePct.toFixed(1)}%
                        </span>
                      )}
                    </p>
                  )}
                  {result.truncated && (
                    <p className="text-sm text-danger">Capped at 25,000 records — narrow the date range for exact numbers.</p>
                  )}
                </div>
                {groups.length === 0 ? (
                  <p className="text-sm text-ink-muted">No data for this combination — widen the dates or loosen a filter.</p>
                ) : (
                  <>
                    {chart === "bar" && <ReportBarChart series={series} format={format} />}
                    {chart === "line" && <ReportLineChart series={series} format={format} />}
                    {(chart === "pie" || chart === "donut") && (
                      <ReportRoundChart series={series} format={format} hole={chart === "donut"} />
                    )}
                    {chart !== "table" && <div className="mt-6 border-t border-border pt-4" />}
                    <ReportTable series={series} totals={totals} format={format} />
                  </>
                )}
              </>
            );
          })()}
      </div>
    </div>
  );
}
