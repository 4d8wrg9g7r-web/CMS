import { describe, expect, it } from "vitest";
import {
  applyReportOrder,
  validateDashboardConfig,
  DASHBOARD_SECTIONS,
  EMPTY_DASHBOARD_CONFIG,
} from "../dashboard/config";

describe("validateDashboardConfig", () => {
  it("accepts a full valid config", () => {
    const config = validateDashboardConfig({
      reportOrder: ["r2", "r1"],
      hiddenSections: ["recentActivity", "metrics"],
    });
    expect(config).toEqual({ reportOrder: ["r2", "r1"], hiddenSections: ["recentActivity", "metrics"] });
  });

  it("degrades malformed input to the empty layout instead of erroring", () => {
    expect(validateDashboardConfig(null)).toEqual(EMPTY_DASHBOARD_CONFIG);
    expect(validateDashboardConfig("nope")).toEqual(EMPTY_DASHBOARD_CONFIG);
    expect(validateDashboardConfig({ reportOrder: "r1", hiddenSections: 7 })).toEqual(EMPTY_DASHBOARD_CONFIG);
  });

  it("drops unknown sections, non-string ids, and duplicates", () => {
    const config = validateDashboardConfig({
      reportOrder: ["r1", 42, "", "r1", "r3"],
      hiddenSections: ["metrics", "sidebar", "metrics", null],
    });
    expect(config).toEqual({ reportOrder: ["r1", "r3"], hiddenSections: ["metrics"] });
  });

  it("bounds the order list", () => {
    const config = validateDashboardConfig({
      reportOrder: Array.from({ length: 250 }, (_, i) => `r${i}`),
      hiddenSections: [],
    });
    expect(config.reportOrder).toHaveLength(100);
  });

  it("knows every hideable section", () => {
    expect(DASHBOARD_SECTIONS).toEqual(["metrics", "pinnedFilters", "pinnedReports", "upcomingEvents", "recentActivity"]);
  });
});

describe("applyReportOrder", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("orders by the saved sequence", () => {
    expect(applyReportOrder(items, ["c", "a", "b"]).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("appends unknown ids in their original relative order and ignores stale ids", () => {
    expect(applyReportOrder(items, ["b", "gone"]).map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(applyReportOrder(items, []).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const input = [{ id: "a" }, { id: "b" }];
    applyReportOrder(input, ["b"]);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
