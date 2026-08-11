import { describe, expect, it } from "vitest";
import { excerpt, mergeTimeline, type AppActivityItem } from "../services/app-activity-service";

function item(at: string, label = "x"): AppActivityItem {
  return { kind: "feed_post", label, detail: "", groupName: null, at: new Date(at) };
}

describe("excerpt", () => {
  it("collapses whitespace and trims", () => {
    expect(excerpt("  hello\n  world  ")).toBe("hello world");
  });

  it("truncates long text with an ellipsis", () => {
    const long = "a".repeat(300);
    const out = excerpt(long);
    expect(out.length).toBe(120);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("mergeTimeline", () => {
  it("merges sources newest-first", () => {
    const merged = mergeTimeline([
      [item("2026-01-01", "old"), item("2026-03-01", "new")],
      [item("2026-02-01", "mid")],
    ]);
    expect(merged.map((m) => m.label)).toEqual(["new", "mid", "old"]);
  });

  it("bounds the merged timeline", () => {
    const many = Array.from({ length: 30 }, (_, i) => item(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`));
    expect(mergeTimeline([many]).length).toBe(15);
    expect(mergeTimeline([many], 5).length).toBe(5);
  });
});
