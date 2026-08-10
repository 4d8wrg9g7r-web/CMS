import { describe, expect, it } from "vitest";
import { isScopedCreateData, isScopedWhere } from "../tenant-guard";

describe("isScopedWhere", () => {
  it("accepts a top-level organizationId", () => {
    expect(isScopedWhere({ organizationId: "org_1" })).toBe(true);
  });

  it("rejects a where clause with no organizationId anywhere", () => {
    expect(isScopedWhere({ id: "res_1" })).toBe(false);
    expect(isScopedWhere({})).toBe(false);
    expect(isScopedWhere(undefined)).toBe(false);
  });

  it("accepts organizationId inside an AND branch", () => {
    expect(isScopedWhere({ AND: [{ status: "ACTIVE" }, { organizationId: "org_1" }] })).toBe(true);
  });

  it("rejects an AND array where no branch has organizationId", () => {
    expect(isScopedWhere({ AND: [{ status: "ACTIVE" }, { title: "x" }] })).toBe(false);
  });

  it("requires every OR branch to carry organizationId", () => {
    expect(
      isScopedWhere({ OR: [{ organizationId: "org_1" }, { organizationId: "org_1", status: "ACTIVE" }] }),
    ).toBe(true);
    expect(isScopedWhere({ OR: [{ organizationId: "org_1" }, { status: "ACTIVE" }] })).toBe(false);
  });
});

describe("isScopedCreateData", () => {
  it("accepts a single create payload with organizationId", () => {
    expect(isScopedCreateData({ organizationId: "org_1", title: "x" })).toBe(true);
  });

  it("rejects a payload missing organizationId", () => {
    expect(isScopedCreateData({ title: "x" })).toBe(false);
  });

  it("requires every item in a createMany payload to carry organizationId", () => {
    expect(isScopedCreateData([{ organizationId: "org_1" }, { organizationId: "org_1" }])).toBe(true);
    expect(isScopedCreateData([{ organizationId: "org_1" }, { title: "no org" }])).toBe(false);
    expect(isScopedCreateData([])).toBe(false);
  });
});
