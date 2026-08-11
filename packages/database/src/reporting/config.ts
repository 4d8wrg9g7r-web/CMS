/**
 * Pure report-configuration module (docs/domain/reports.md). A ReportConfig is
 * assembled client-side in the report builder and stored verbatim in SavedReport —
 * both are untrusted, so validateReportConfig is the single gate every config
 * passes through before any query runs.
 */

export const REPORT_SOURCES = ["people", "attendance", "giving"] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const TIME_BUCKETS = ["week", "month", "year"] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

export const REPORT_CHARTS = ["bar", "line", "pie", "donut", "table"] as const;
export type ReportChart = (typeof REPORT_CHARTS)[number];

export const COMPARE_MODES = ["previousPeriod", "previousYear"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export type ReportMeasure = "count" | "uniquePeople" | "sumAmount";

export type ReportGroupBy =
  | { kind: "time"; bucket: TimeBucket }
  | { kind: "dimension"; field: string };

export interface ReportFilters {
  membershipStatus?: string | null;
  campusId?: string | null;
  fundId?: string | null;
  method?: string | null;
  eventId?: string | null;
  customFieldKey?: string | null;
  customFieldValue?: string | null;
}

export interface ReportConfig {
  source: ReportSource;
  /** Inclusive YYYY-MM-DD bounds; null = open-ended. */
  from: string | null;
  to: string | null;
  groupBy: ReportGroupBy;
  measure: ReportMeasure;
  chart: ReportChart;
  filters: ReportFilters;
  /** Overlay a second color-coded period (e.g. this year vs last year). */
  compare?: CompareMode | null;
}

/** Person-attribute dimensions available on every source (rows join to a Person). */
export const PERSON_DIMENSIONS = ["membershipStatus", "campus"] as const;

export function dimensionsForSource(source: ReportSource, customFieldKeys: string[]): string[] {
  const custom = customFieldKeys.map((k) => `custom:${k}`);
  const person = [...PERSON_DIMENSIONS, ...custom];
  if (source === "attendance") return [...person, "event"];
  if (source === "giving") return [...person, "fund", "method"];
  return person;
}

export function measuresForSource(source: ReportSource): ReportMeasure[] {
  if (source === "people") return ["count"];
  if (source === "attendance") return ["count", "uniquePeople"];
  return ["sumAmount", "count", "uniquePeople"];
}

/**
 * Whether the config reaches into person data (dimensions or filters) beyond the
 * source's own rows — used by the action layer to additionally require person.view
 * (BLUEPRINT §61: an aggregate over restricted fields still leaks them).
 */
export function reportUsesPersonData(config: ReportConfig): boolean {
  if (config.source === "people") return true;
  const dim = config.groupBy.kind === "dimension" ? config.groupBy.field : "";
  if (dim === "membershipStatus" || dim === "campus" || dim.startsWith("custom:")) return true;
  const f = config.filters;
  return Boolean(f.membershipStatus || f.campusId || f.customFieldKey);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ReportValidation = { ok: true; config: ReportConfig } | { ok: false; errors: string[] };

export function validateReportConfig(input: unknown, customFieldKeys: string[]): ReportValidation {
  const errors: string[] = [];
  const raw = input as Partial<ReportConfig> | null;
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["The report configuration is malformed."] };

  const source = raw.source as ReportSource;
  if (!REPORT_SOURCES.includes(source)) return { ok: false, errors: ["Unknown report source."] };

  const from = typeof raw.from === "string" && raw.from ? raw.from : null;
  const to = typeof raw.to === "string" && raw.to ? raw.to : null;
  if (from && !DATE_RE.test(from)) errors.push("The start date is invalid.");
  if (to && !DATE_RE.test(to)) errors.push("The end date is invalid.");
  if (from && to && from > to) errors.push("The start date is after the end date.");

  let groupBy: ReportGroupBy = { kind: "time", bucket: "month" };
  const g = raw.groupBy as ReportGroupBy | undefined;
  if (g && typeof g === "object" && g.kind === "time") {
    if (!TIME_BUCKETS.includes((g as { bucket: TimeBucket }).bucket)) errors.push("Unknown time bucket.");
    else groupBy = { kind: "time", bucket: g.bucket };
  } else if (g && typeof g === "object" && g.kind === "dimension") {
    const field = String((g as { field: unknown }).field ?? "");
    if (!dimensionsForSource(source, customFieldKeys).includes(field)) {
      errors.push(`"${field}" is not a valid grouping for this source.`);
    } else groupBy = { kind: "dimension", field };
  } else if (g !== undefined) {
    errors.push("Unknown grouping.");
  }

  const measure = (raw.measure ?? measuresForSource(source)[0]) as ReportMeasure;
  if (!measuresForSource(source).includes(measure)) errors.push(`"${measure}" is not a valid measure for this source.`);

  const chart = (raw.chart ?? "bar") as ReportChart;
  if (!REPORT_CHARTS.includes(chart)) errors.push("Unknown chart type.");

  const rawFilters = (raw.filters ?? {}) as ReportFilters;
  const filters: ReportFilters = {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  filters.membershipStatus = str(rawFilters.membershipStatus);
  filters.campusId = str(rawFilters.campusId);
  filters.fundId = source === "giving" ? str(rawFilters.fundId) : null;
  filters.method = source === "giving" ? str(rawFilters.method) : null;
  filters.eventId = source === "attendance" ? str(rawFilters.eventId) : null;
  filters.customFieldKey = str(rawFilters.customFieldKey);
  filters.customFieldValue = str(rawFilters.customFieldValue);
  if (filters.customFieldKey && !customFieldKeys.includes(filters.customFieldKey)) {
    errors.push("Unknown custom field in filters.");
  }
  if (filters.customFieldKey && !filters.customFieldValue) {
    errors.push("Choose a value for the custom-field filter.");
  }

  let compare: CompareMode | null = null;
  if (raw.compare !== undefined && raw.compare !== null) {
    if (!COMPARE_MODES.includes(raw.compare as CompareMode)) {
      errors.push("Unknown comparison mode.");
    } else if (!from || !to) {
      errors.push("Comparisons need explicit start and end dates.");
    } else {
      compare = raw.compare as CompareMode;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: { source, from, to, groupBy, measure, chart, filters, compare } };
}
