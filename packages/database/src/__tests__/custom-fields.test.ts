import { describe, expect, it } from "vitest";
import { PersonFieldType } from "@prisma/client";
import {
  coerceFieldValue,
  formatFieldValue,
  inferFieldType,
  slugifyFieldKey,
} from "../people/custom-fields";
import { extractExtraColumns, validateMappingPlan, type MappingPlan } from "../people/import-mapping";
import { inverseRelationshipType } from "../people/helpers";
import { PersonRelationshipType } from "@prisma/client";

describe("slugifyFieldKey", () => {
  it("slugs labels into stable keys", () => {
    expect(slugifyFieldKey("Veteran Status (Y/N)")).toBe("veteran-status-y-n");
    expect(slugifyFieldKey("  Baptism Date  ")).toBe("baptism-date");
    expect(slugifyFieldKey("!!!")).toBe("");
  });
});

describe("inferFieldType", () => {
  it("detects yes/no columns", () => {
    expect(inferFieldType(["Yes", "no", "Y", "N"], 4)).toBe(PersonFieldType.BOOLEAN);
  });
  it("detects date columns in ISO and US formats", () => {
    expect(inferFieldType(["2020-01-15", "3/4/1998"], 2)).toBe(PersonFieldType.DATE);
  });
  it("detects numeric columns", () => {
    expect(inferFieldType(["1", "2,500", "3.5"], 3)).toBe(PersonFieldType.NUMBER);
  });
  it("suggests a dropdown for a small repeated vocabulary", () => {
    expect(inferFieldType(["Choir", "Band", "Choir", "Tech", "Band", "Choir"], 3)).toBe(PersonFieldType.SELECT);
  });
  it("falls back to text for free-form values", () => {
    expect(inferFieldType(["Loves hiking", "Allergic to peanuts"], 2)).toBe(PersonFieldType.TEXT);
    expect(inferFieldType([], 0)).toBe(PersonFieldType.TEXT);
  });
});

describe("coerceFieldValue", () => {
  it("coerces booleans and rejects garbage", () => {
    expect(coerceFieldValue(PersonFieldType.BOOLEAN, "Yes")).toEqual({ ok: true, value: true });
    expect(coerceFieldValue(PersonFieldType.BOOLEAN, "0")).toEqual({ ok: true, value: false });
    expect(coerceFieldValue(PersonFieldType.BOOLEAN, "maybe").ok).toBe(false);
  });
  it("coerces numbers with thousands separators", () => {
    expect(coerceFieldValue(PersonFieldType.NUMBER, "2,500.5")).toEqual({ ok: true, value: 2500.5 });
    expect(coerceFieldValue(PersonFieldType.NUMBER, "abc").ok).toBe(false);
  });
  it("normalizes dates to YYYY-MM-DD and rejects rollovers", () => {
    expect(coerceFieldValue(PersonFieldType.DATE, "3/4/1998")).toEqual({ ok: true, value: "1998-03-04" });
    expect(coerceFieldValue(PersonFieldType.DATE, "2/31/2020").ok).toBe(false);
  });
  it("treats empty as null (no value stored)", () => {
    expect(coerceFieldValue(PersonFieldType.NUMBER, "  ")).toEqual({ ok: true, value: null });
  });
  it("splits multi-select on the plan delimiter", () => {
    expect(coerceFieldValue(PersonFieldType.MULTI_SELECT, "a; b;", ";")).toEqual({ ok: true, value: ["a", "b"] });
  });
});

describe("formatFieldValue", () => {
  it("renders booleans, arrays, and empties", () => {
    expect(formatFieldValue(PersonFieldType.BOOLEAN, true)).toBe("Yes");
    expect(formatFieldValue(PersonFieldType.MULTI_SELECT, ["a", "b"])).toBe("a, b");
    expect(formatFieldValue(PersonFieldType.TEXT, null)).toBe("—");
  });
});

describe("inverseRelationshipType (expanded)", () => {
  it("pairs the new directional types", () => {
    expect(inverseRelationshipType(PersonRelationshipType.GRANDPARENT)).toBe(PersonRelationshipType.GRANDCHILD);
    expect(inverseRelationshipType(PersonRelationshipType.FOSTER_CHILD)).toBe(PersonRelationshipType.FOSTER_PARENT);
    expect(inverseRelationshipType(PersonRelationshipType.GUARDIAN)).toBe(PersonRelationshipType.WARD);
    expect(inverseRelationshipType(PersonRelationshipType.WARD)).toBe(PersonRelationshipType.GUARDIAN);
  });
});

const HEADERS = ["Full Name", "Veteran", "Ministry", "Household"];
const RECORDS = [
  HEADERS,
  ["Dana Whitfield", "Yes", "Choir", "Whitfield Family"],
  ["Sam Ortiz", "No", "Band", "Ortiz Home"],
  ["Ana Berg", "", "Choir", "Whitfield Family"],
];

function customPlan(): MappingPlan {
  const result = validateMappingPlan(
    {
      columns: [
        { sourceHeader: "Full Name", target: "fullName", nameOrder: "firstLast" },
        { sourceHeader: "Veteran", target: "custom", customField: { key: "", label: "Veteran", type: "BOOLEAN" } },
        { sourceHeader: "Ministry", target: "custom", customField: { key: "", label: "Ministry", type: "SELECT" } },
        { sourceHeader: "Household", target: "household" },
      ],
      statusRules: [],
      tagDelimiter: ";",
      summary: "",
    },
    HEADERS,
  );
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.plan;
}

describe("validateMappingPlan with custom/household targets", () => {
  it("accepts multiple custom columns and slugs their keys from labels", () => {
    const plan = customPlan();
    const customs = plan.columns.filter((c) => c.target === "custom");
    expect(customs.map((c) => c.customField!.key)).toEqual(["veteran", "ministry"]);
  });

  it("rejects a custom column without a valid type and duplicate keys", () => {
    const noType = validateMappingPlan(
      {
        columns: [
          { sourceHeader: "Full Name", target: "fullName" },
          { sourceHeader: "Veteran", target: "custom", customField: { key: "", label: "Veteran", type: "FANCY" } },
        ],
        statusRules: [],
        tagDelimiter: ";",
        summary: "",
      },
      HEADERS,
    );
    expect(noType.ok).toBe(false);

    const dupKeys = validateMappingPlan(
      {
        columns: [
          { sourceHeader: "Full Name", target: "fullName" },
          { sourceHeader: "Veteran", target: "custom", customField: { key: "x", label: "X", type: "TEXT" } },
          { sourceHeader: "Ministry", target: "custom", customField: { key: "x", label: "X", type: "TEXT" } },
        ],
        statusRules: [],
        tagDelimiter: ";",
        summary: "",
      },
      HEADERS,
    );
    expect(dupKeys.ok).toBe(false);
  });

  it("rejects two household columns", () => {
    const result = validateMappingPlan(
      {
        columns: [
          { sourceHeader: "Full Name", target: "fullName" },
          { sourceHeader: "Veteran", target: "household" },
          { sourceHeader: "Household", target: "household" },
        ],
        statusRules: [],
        tagDelimiter: ";",
        summary: "",
      },
      HEADERS,
    );
    expect(result.ok).toBe(false);
  });
});

describe("extractExtraColumns", () => {
  it("coerces custom values, derives select options, and pulls household names", () => {
    const { fields, byLine, errors } = extractExtraColumns(RECORDS, customPlan(), []);
    expect(errors).toEqual([]);
    expect(fields.map((f) => ({ key: f.key, type: f.type }))).toEqual([
      { key: "veteran", type: PersonFieldType.BOOLEAN },
      { key: "ministry", type: PersonFieldType.SELECT },
    ]);
    expect(fields[1]!.options).toEqual(["Choir", "Band"]);
    expect(byLine.get(2)).toEqual({ householdName: "Whitfield Family", custom: { veteran: true, ministry: "Choir" } });
    // Empty veteran cell on line 4: no value key, household still present.
    expect(byLine.get(4)).toEqual({ householdName: "Whitfield Family", custom: { ministry: "Choir" } });
  });

  it("reports coercion failures as line errors and drops those lines", () => {
    const records = [HEADERS, ["Dana Whitfield", "possibly", "Choir", "H"]];
    const { byLine, errors } = extractExtraColumns(records, customPlan(), []);
    expect(errors[0]!.line).toBe(2);
    expect(errors[0]!.message).toContain("Veteran");
    expect(byLine.has(2)).toBe(false);
  });

  it("lets an existing definition's type win over the plan", () => {
    const { fields, errors } = extractExtraColumns(RECORDS, customPlan(), [
      { key: "veteran", label: "Veteran Status", type: PersonFieldType.TEXT, options: [] },
    ]);
    expect(fields[0]).toMatchObject({ key: "veteran", label: "Veteran Status", type: PersonFieldType.TEXT, existing: true });
    expect(errors).toEqual([]);
  });

  it("extends an existing select's options with new file values only", () => {
    const { fields } = extractExtraColumns(RECORDS, customPlan(), [
      { key: "ministry", label: "Ministry", type: PersonFieldType.SELECT, options: ["choir", "Ushers"] },
    ]);
    const ministry = fields.find((f) => f.key === "ministry")!;
    expect(ministry.options).toEqual(["choir", "Ushers", "Band"]);
  });
});
