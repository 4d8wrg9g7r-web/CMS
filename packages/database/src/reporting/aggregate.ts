import type { CompareMode, ReportConfig, ReportMeasure } from "./config";

/**
 * Pure aggregation for the report builder (docs/domain/reports.md). The service
 * fetches slim, already-labeled rows; everything countable happens here so it is
 * unit-testable without a database.
 */

/** One source row, normalized: when it happened, who (if linked), how much, and
 * the value of the chosen grouping dimension (already resolved to a label). */
export interface ReportRow {
  date: Date;
  personId: string | null;
  amountCents: number | null;
  dim: string | null;
}

export interface ReportGroup {
  label: string;
  value: number;
}

export interface ReportResult {
  groups: ReportGroup[];
  /** Total under the same measure (unique people de-duplicated across groups). */
  total: number;
  rowCount: number;
  measure: ReportMeasure;
}

/** Hard ceiling on time buckets — beyond this the range/bucket combo is a mistake. */
export const MAX_TIME_BUCKETS = 400;

function weekStartUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function bucketKey(date: Date, bucket: "week" | "month" | "year"): string {
  if (bucket === "year") return String(date.getUTCFullYear());
  if (bucket === "month") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return weekStartUTC(date).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucketLabel(key: string, bucket: "week" | "month" | "year"): string {
  if (bucket === "year") return key;
  if (bucket === "month") {
    const [y, m] = key.split("-");
    return `${MONTHS[Number(m) - 1]} ${y}`;
  }
  const d = new Date(`${key}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function nextBucket(key: string, bucket: "week" | "month" | "year"): string {
  if (bucket === "year") return String(Number(key) + 1);
  if (bucket === "month") {
    const [y, m] = key.split("-").map(Number);
    return m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`;
  }
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

function measureValue(rows: ReportRow[], measure: ReportMeasure): number {
  if (measure === "sumAmount") return rows.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  if (measure === "uniquePeople") return new Set(rows.map((r) => r.personId).filter(Boolean)).size;
  return rows.length;
}

/** Shifts an explicit date range back for comparison overlays. */
export function shiftRange(from: string, to: string, mode: CompareMode): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const parse = (s: string) => new Date(`${s}T00:00:00Z`);
  if (mode === "previousYear") {
    const shift = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      const shifted = new Date(Date.UTC(y! - 1, m! - 1, d!));
      // Feb 29 → Mar 1 rollover: clamp back to the month's last day.
      if (shifted.getUTCMonth() !== m! - 1) shifted.setUTCDate(0);
      return iso(shifted);
    };
    return { from: shift(from), to: shift(to) };
  }
  const lengthDays = Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000) + 1;
  const newTo = new Date(parse(from).getTime() - 86400000);
  const newFrom = new Date(newTo.getTime() - (lengthDays - 1) * 86400000);
  return { from: iso(newFrom), to: iso(newTo) };
}

/** "2025-01-01".."2025-12-31" → "2025"; open ranges → "All time"; else from → to. */
export function periodLabel(from: string | null, to: string | null): string {
  if (!from || !to) return "All time";
  const [fy] = from.split("-");
  const [ty] = to.split("-");
  if (fy === ty && from.endsWith("-01-01") && to.endsWith("-12-31")) return fy!;
  return `${from} → ${to}`;
}

export interface AlignedSeries {
  labels: string[];
  primary: number[];
  comparison: number[];
}

export interface AlignedMany {
  labels: string[];
  /** values[0] is the primary; values[1..] are the comparisons, in order. */
  values: number[][];
}

/**
 * Aligns any number of comparison runs against the primary. Time series align
 * positionally (bucket 1 vs bucket 1 — "Jan 2026" pairs with "Jan 2025"), padded
 * with zeros; dimension series align by label, with labels that only appear in a
 * comparison appended so nothing silently disappears.
 */
export function alignMany(
  primary: ReportResult,
  comparisons: ReportResult[],
  kind: "time" | "dimension",
): AlignedMany {
  if (kind === "time") {
    const labels = primary.groups.map((g) => g.label);
    return {
      labels,
      values: [
        primary.groups.map((g) => g.value),
        ...comparisons.map((c) => labels.map((_, i) => c.groups[i]?.value ?? 0)),
      ],
    };
  }
  const seen = new Set(primary.groups.map((g) => g.label));
  const labels = [...primary.groups.map((g) => g.label)];
  for (const c of comparisons) {
    for (const g of c.groups) {
      if (!seen.has(g.label)) {
        seen.add(g.label);
        labels.push(g.label);
      }
    }
  }
  const byLabel = (r: ReportResult) => {
    const map = new Map(r.groups.map((g) => [g.label, g.value]));
    return labels.map((l) => map.get(l) ?? 0);
  };
  return { labels, values: [byLabel(primary), ...comparisons.map(byLabel)] };
}

/** Two-series convenience over alignMany (kept for callers and tests). */
export function alignSeries(
  primary: ReportResult,
  comparison: ReportResult,
  kind: "time" | "dimension",
): AlignedSeries {
  const aligned = alignMany(primary, [comparison], kind);
  return { labels: aligned.labels, primary: aligned.values[0]!, comparison: aligned.values[1]! };
}

export function aggregateReport(rows: ReportRow[], config: ReportConfig): ReportResult {
  const measure = config.measure;

  if (config.groupBy.kind === "dimension") {
    const byDim = new Map<string, ReportRow[]>();
    for (const row of rows) {
      const key = row.dim ?? "None";
      const list = byDim.get(key) ?? [];
      list.push(row);
      byDim.set(key, list);
    }
    const groups = [...byDim.entries()]
      .map(([label, groupRows]) => ({ label, value: measureValue(groupRows, measure) }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    return { groups, total: measureValue(rows, measure), rowCount: rows.length, measure };
  }

  // Time series: bucket, then fill gaps so lines don't silently skip empty periods.
  const bucket = config.groupBy.bucket;
  const byBucket = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = bucketKey(row.date, bucket);
    const list = byBucket.get(key) ?? [];
    list.push(row);
    byBucket.set(key, list);
  }

  const boundKeys = [...byBucket.keys()].sort();
  const startKey = config.from ? bucketKey(new Date(`${config.from}T00:00:00Z`), bucket) : boundKeys[0];
  const endKey = config.to ? bucketKey(new Date(`${config.to}T00:00:00Z`), bucket) : boundKeys[boundKeys.length - 1];
  const groups: ReportGroup[] = [];
  if (startKey && endKey && startKey <= endKey) {
    let key = startKey;
    for (let i = 0; i < MAX_TIME_BUCKETS && key <= endKey; i++) {
      groups.push({ label: bucketLabel(key, bucket), value: measureValue(byBucket.get(key) ?? [], measure) });
      key = nextBucket(key, bucket);
    }
  }
  return { groups, total: measureValue(rows, measure), rowCount: rows.length, measure };
}
