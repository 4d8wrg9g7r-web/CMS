import { describe, expect, it } from "vitest";
import {
  dimensionsForSource,
  measuresForSource,
  reportUsesPersonData,
  validateReportConfig,
  type ReportConfig,
} from "../reporting/config";
import {
  aggregateReport,
  alignMany,
  alignSeries,
  periodLabel,
  shiftRange,
  MAX_TIME_BUCKETS,
  type ReportRow,
} from "../reporting/aggregate";

const KEYS = ["veteran", "ministry-team"];

function base(overrides: Partial<ReportConfig> = {}): ReportConfig {
  return {
    source: "giving",
    from: "2026-01-01",
    to: "2026-03-31",
    groupBy: { kind: "dimension", field: "fund" },
    measure: "sumAmount",
    chart: "bar",
    filters: {},
    ...overrides,
  };
}

describe("validateReportConfig", () => {
  it("accepts a coherent config", () => {
    const result = validateReportConfig(base(), KEYS);
    expect(result.ok).toBe(true);
  });

  it("rejects unknown sources, dims for the wrong source, and bad measures", () => {
    expect(validateReportConfig(base({ source: "payroll" as never }), KEYS).ok).toBe(false);
    expect(validateReportConfig(base({ source: "people", groupBy: { kind: "dimension", field: "fund" } }), KEYS).ok).toBe(false);
    expect(validateReportConfig(base({ source: "people", measure: "sumAmount" }), KEYS).ok).toBe(false);
    expect(validateReportConfig(base({ groupBy: { kind: "dimension", field: "custom:nope" } }), KEYS).ok).toBe(false);
  });

  it("accepts custom-field dimensions that exist", () => {
    const result = validateReportConfig(base({ groupBy: { kind: "dimension", field: "custom:veteran" } }), KEYS);
    expect(result.ok).toBe(true);
  });

  it("rejects inverted or malformed dates", () => {
    expect(validateReportConfig(base({ from: "2026-05-01", to: "2026-01-01" }), KEYS).ok).toBe(false);
    expect(validateReportConfig(base({ from: "yesterday" }), KEYS).ok).toBe(false);
  });

  it("requires a value when filtering by custom field and drops cross-source filters", () => {
    expect(validateReportConfig(base({ filters: { customFieldKey: "veteran" } }), KEYS).ok).toBe(false);
    const result = validateReportConfig(base({ source: "attendance", measure: "count", groupBy: { kind: "time", bucket: "month" }, filters: { fundId: "f1" } }), KEYS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.filters.fundId).toBeNull();
  });
});

describe("reportUsesPersonData", () => {
  it("is always true for the people source", () => {
    const r = validateReportConfig(base({ source: "people", measure: "count", groupBy: { kind: "time", bucket: "month" } }), KEYS);
    if (!r.ok) throw new Error("invalid");
    expect(reportUsesPersonData(r.config)).toBe(true);
  });
  it("is true when a person dimension or filter is used on another source", () => {
    const dim = validateReportConfig(base({ groupBy: { kind: "dimension", field: "membershipStatus" } }), KEYS);
    if (!dim.ok) throw new Error("invalid");
    expect(reportUsesPersonData(dim.config)).toBe(true);

    const plain = validateReportConfig(base(), KEYS);
    if (!plain.ok) throw new Error("invalid");
    expect(reportUsesPersonData(plain.config)).toBe(false);
  });
});

describe("dimension/measure whitelists", () => {
  it("scopes dims and measures per source", () => {
    expect(dimensionsForSource("giving", KEYS)).toContain("fund");
    expect(dimensionsForSource("attendance", KEYS)).toContain("event");
    expect(dimensionsForSource("people", KEYS)).not.toContain("fund");
    expect(dimensionsForSource("people", KEYS)).toContain("custom:veteran");
    expect(measuresForSource("people")).toEqual(["count"]);
    expect(measuresForSource("giving")).toContain("sumAmount");
  });
});

describe("aggregateReport", () => {
  const rows: ReportRow[] = [
    { date: new Date("2026-01-04T00:00:00Z"), personId: "p1", amountCents: 10000, dim: "General" },
    { date: new Date("2026-01-11T00:00:00Z"), personId: "p1", amountCents: 5000, dim: "General" },
    { date: new Date("2026-03-01T00:00:00Z"), personId: "p2", amountCents: 2500, dim: "Missions" },
    { date: new Date("2026-03-02T00:00:00Z"), personId: null, amountCents: 1000, dim: null },
  ];

  it("groups by dimension sorted by value with None for null dims", () => {
    const result = aggregateReport(rows, base());
    expect(result.groups).toEqual([
      { label: "General", value: 15000 },
      { label: "Missions", value: 2500 },
      { label: "None", value: 1000 },
    ]);
    expect(result.total).toBe(18500);
  });

  it("counts unique people across groups without double-counting in the total", () => {
    const config = base({ measure: "uniquePeople", groupBy: { kind: "dimension", field: "fund" } });
    const result = aggregateReport(rows, config);
    expect(result.groups.find((g) => g.label === "General")!.value).toBe(1);
    expect(result.total).toBe(2); // p1 + p2; the null personId row never counts
  });

  it("fills empty time buckets across the configured range", () => {
    const config = base({ groupBy: { kind: "time", bucket: "month" }, measure: "count" });
    const result = aggregateReport(rows, config);
    expect(result.groups.map((g) => g.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(result.groups.map((g) => g.value)).toEqual([2, 0, 2]);
  });

  it("buckets by Sunday-start weeks and by year", () => {
    const weekly = aggregateReport(rows.slice(0, 2), base({ from: "2026-01-04", to: "2026-01-11", groupBy: { kind: "time", bucket: "week" }, measure: "count" }));
    expect(weekly.groups.map((g) => g.value)).toEqual([1, 1]);
    const yearly = aggregateReport(rows, base({ from: null, to: null, groupBy: { kind: "time", bucket: "year" }, measure: "count" }));
    expect(yearly.groups).toEqual([{ label: "2026", value: 4 }]);
  });

  it("caps runaway bucket ranges", () => {
    const config = base({ from: "1900-01-01", to: "2100-01-01", groupBy: { kind: "time", bucket: "week" }, measure: "count" });
    const result = aggregateReport(rows, config);
    expect(result.groups.length).toBeLessThanOrEqual(MAX_TIME_BUCKETS);
  });

  it("handles empty row sets", () => {
    const result = aggregateReport([], base({ from: null, to: null, groupBy: { kind: "time", bucket: "month" } }));
    expect(result.groups).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("compare config validation", () => {
  it("accepts compare with explicit dates and rejects it without", () => {
    expect(validateReportConfig(base({ compare: "previousYear" }), KEYS).ok).toBe(true);
    expect(validateReportConfig(base({ compare: "previousYear", from: null }), KEYS).ok).toBe(false);
    expect(validateReportConfig(base({ compare: "sideways" as never }), KEYS).ok).toBe(false);
  });
  it("accepts the pie chart type", () => {
    expect(validateReportConfig(base({ chart: "pie" }), KEYS).ok).toBe(true);
  });
});

describe("shiftRange", () => {
  it("shifts previousYear keeping month/day, clamping Feb 29", () => {
    expect(shiftRange("2026-01-01", "2026-12-31", "previousYear")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(shiftRange("2024-02-29", "2024-02-29", "previousYear")).toEqual({ from: "2023-02-28", to: "2023-02-28" });
  });
  it("shifts previousPeriod back by the exact range length", () => {
    expect(shiftRange("2026-03-01", "2026-03-31", "previousPeriod")).toEqual({ from: "2026-01-29", to: "2026-02-28" });
    expect(shiftRange("2026-01-08", "2026-01-14", "previousPeriod")).toEqual({ from: "2026-01-01", to: "2026-01-07" });
  });
});

describe("periodLabel", () => {
  it("names full years, open ranges, and arbitrary ranges", () => {
    expect(periodLabel("2026-01-01", "2026-12-31")).toBe("2026");
    expect(periodLabel(null, null)).toBe("All time");
    expect(periodLabel("2026-01-01", "2026-03-31")).toBe("2026-01-01 → 2026-03-31");
  });
});

describe("alignSeries", () => {
  const result = (values: [string, number][]) => ({
    groups: values.map(([label, value]) => ({ label, value })),
    total: values.reduce((s, [, v]) => s + v, 0),
    rowCount: 0,
    measure: "count" as const,
  });

  it("aligns time series positionally and pads the shorter run", () => {
    const aligned = alignSeries(
      result([["Jan 2026", 5], ["Feb 2026", 8], ["Mar 2026", 2]]),
      result([["Jan 2025", 3]]),
      "time",
    );
    expect(aligned.labels).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(aligned.primary).toEqual([5, 8, 2]);
    expect(aligned.comparison).toEqual([3, 0, 0]);
  });

  it("aligns dimensions by label and appends comparison-only labels", () => {
    const aligned = alignSeries(
      result([["General", 100], ["Missions", 40]]),
      result([["General", 80], ["Building", 25]]),
      "dimension",
    );
    expect(aligned.labels).toEqual(["General", "Missions", "Building"]);
    expect(aligned.primary).toEqual([100, 40, 0]);
    expect(aligned.comparison).toEqual([80, 0, 25]);
  });

  it("aligns four series at once across time and dimensions", () => {
    const time = alignMany(
      result([["Jan 2026", 5], ["Feb 2026", 8]]),
      [result([["Jan 2025", 3]]), result([["Jan 2024", 1], ["Feb 2024", 2]]), result([])],
      "time",
    );
    expect(time.values).toEqual([
      [5, 8],
      [3, 0],
      [1, 2],
      [0, 0],
    ]);

    const dims = alignMany(
      result([["General", 100]]),
      [result([["Building", 25]]), result([["General", 10], ["Youth", 5]])],
      "dimension",
    );
    expect(dims.labels).toEqual(["General", "Building", "Youth"]);
    expect(dims.values).toEqual([
      [100, 0, 0],
      [0, 25, 0],
      [10, 0, 5],
    ]);
  });
});

describe("compareCount validation and iterated shifts", () => {
  it("defaults to 1, accepts up to 3, rejects beyond", () => {
    const one = validateReportConfig(base({ compare: "previousYear" }), KEYS);
    expect(one.ok && one.config.compareCount).toBe(1);
    const three = validateReportConfig(base({ compare: "previousYear", compareCount: 3 }), KEYS);
    expect(three.ok && three.config.compareCount).toBe(3);
    expect(validateReportConfig(base({ compare: "previousYear", compareCount: 4 }), KEYS).ok).toBe(false);
    expect(validateReportConfig(base({ compare: "previousYear", compareCount: 0 }), KEYS).ok).toBe(false);
  });

  it("shifts ranges repeatedly for deeper comparisons", () => {
    let range = { from: "2026-01-01", to: "2026-12-31" };
    range = shiftRange(range.from, range.to, "previousYear");
    range = shiftRange(range.from, range.to, "previousYear");
    expect(range).toEqual({ from: "2024-01-01", to: "2024-12-31" });
  });
});
