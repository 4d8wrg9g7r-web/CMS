import { describe, expect, it } from "vitest";
import { computeBackoff } from "../outbox/backoff";

describe("computeBackoff", () => {
  it("is zero for the zeroth attempt", () => {
    expect(computeBackoff(0)).toBe(0);
  });

  it("grows exponentially from the base", () => {
    expect(computeBackoff(1)).toBe(1000);
    expect(computeBackoff(2)).toBe(2000);
    expect(computeBackoff(3)).toBe(4000);
    expect(computeBackoff(4)).toBe(8000);
  });

  it("is monotonically non-decreasing", () => {
    let prev = -1;
    for (let a = 0; a <= 20; a++) {
      const b = computeBackoff(a);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  it("caps at the ceiling and never overflows on absurd inputs", () => {
    const cap = 5 * 60 * 1000;
    expect(computeBackoff(100)).toBe(cap);
    expect(computeBackoff(1_000_000)).toBe(cap);
    expect(Number.isFinite(computeBackoff(1_000_000))).toBe(true);
  });

  it("honors custom base and cap", () => {
    expect(computeBackoff(1, 500, 10_000)).toBe(500);
    expect(computeBackoff(10, 500, 10_000)).toBe(10_000);
  });
});
