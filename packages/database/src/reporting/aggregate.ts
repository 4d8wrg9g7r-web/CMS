import type { ReportConfig, ReportMeasure } from "./config";

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
