import { describe, expect, it } from "vitest";
import { MembershipStatus } from "@prisma/client";
import { mapImportRows } from "../people/import";
import {
  applyMappingPlan,
  buildColumnProfiles,
  maskImportValue,
  validateMappingPlan,
  type MappingPlan,
} from "../people/import-mapping";

describe("maskImportValue", () => {
  it("masks email local parts but keeps the domain", () => {
    expect(maskImportValue("dana.whitfield@example.org")).toBe("d***@example.org");
  });

  it("masks phone-shaped values digit by digit", () => {
    expect(maskImportValue("(555) 201-4433")).toBe("(###) ###-####");
    expect(maskImportValue("+1 555 201 4433")).toBe("+# ### ### ####");
  });

  it("leaves statuses, tags, campuses, and short numbers untouched", () => {
    expect(maskImportValue("Regular attender")).toBe("Regular attender");
    expect(maskImportValue("North Campus")).toBe("North Campus");
    expect(maskImportValue("Grade 5")).toBe("Grade 5");
  });
});

describe("buildColumnProfiles", () => {
  const records = [
    ["Full Name", "E-mail", "Status"],
    ["Dana Whitfield", "dana@example.org", "Regular attender"],
    ["Sam Ortiz", "sam@example.org", "Member"],
    ["Ana Berg", "", "regular attender"],
  ];

  it("profiles headers, masked samples, distinct and empty counts", () => {
    const profiles = buildColumnProfiles(records);
    expect(profiles.map((p) => p.header)).toEqual(["Full Name", "E-mail", "Status"]);
    const email = profiles[1]!;
    expect(email.samples).toEqual(["d***@example.org", "s***@example.org"]);
    expect(email.emptyCount).toBe(1);
    expect(email.rowCount).toBe(3);
    // "Regular attender" and "regular attender" are the same distinct value.
    expect(profiles[2]!.distinctCount).toBe(2);
  });

  it("returns nothing for an empty file", () => {
    expect(buildColumnProfiles([])).toEqual([]);
  });
});

const HEADERS = ["Full Name", "E-mail", "Mobile", "Status", "Site"];

function plan(overrides: Partial<MappingPlan> = {}): unknown {
  return {
    columns: [
      { sourceHeader: "Full Name", target: "fullName", nameOrder: "firstLast" },
      { sourceHeader: "E-mail", target: "email" },
      { sourceHeader: "Mobile", target: "phone" },
      { sourceHeader: "Status", target: "membershipStatus" },
      { sourceHeader: "Site", target: "campus" },
    ],
    statusRules: [{ sourceValue: "Regular attender", status: "ATTENDER" }],
    tagDelimiter: ";",
    summary: "Mapped 5 of 5 columns.",
    ...overrides,
  };
}

describe("validateMappingPlan", () => {
  it("accepts a coherent plan and canonicalizes headers case-insensitively", () => {
    const p = plan() as MappingPlan;
    (p.columns[0] as { sourceHeader: string }).sourceHeader = "full name";
    const result = validateMappingPlan(p, HEADERS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.columns[0]!.sourceHeader).toBe("Full Name");
  });

  it("rejects garbage input", () => {
    expect(validateMappingPlan(null, HEADERS).ok).toBe(false);
    expect(validateMappingPlan("nope", HEADERS).ok).toBe(false);
    expect(validateMappingPlan({ columns: "x", statusRules: [] }, HEADERS).ok).toBe(false);
  });

  it("rejects columns that do not exist in the file", () => {
    const result = validateMappingPlan(
      plan({ columns: [{ sourceHeader: "Nope", target: "firstName" }] } as Partial<MappingPlan>),
      HEADERS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain('"Nope"');
  });

  it("rejects duplicate targets and fullName combined with firstName", () => {
    const dup = validateMappingPlan(
      plan({
        columns: [
          { sourceHeader: "Full Name", target: "email" },
          { sourceHeader: "E-mail", target: "email" },
        ],
      } as Partial<MappingPlan>),
      HEADERS,
    );
    expect(dup.ok).toBe(false);

    const clash = validateMappingPlan(
      plan({
        columns: [
          { sourceHeader: "Full Name", target: "fullName" },
          { sourceHeader: "E-mail", target: "firstName" },
          { sourceHeader: "Mobile", target: "lastName" },
        ],
      } as Partial<MappingPlan>),
      HEADERS,
    );
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.errors.join(" ")).toContain("fullName cannot be combined");
  });

  it("rejects a plan with no name coverage", () => {
    const result = validateMappingPlan(
      plan({ columns: [{ sourceHeader: "E-mail", target: "email" }] } as Partial<MappingPlan>),
      HEADERS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("must map firstName and lastName");
  });

  it("rejects unknown statuses and unknown targets", () => {
    const badStatus = validateMappingPlan(
      plan({ statusRules: [{ sourceValue: "Regular", status: "SUPERFAN" }] } as unknown as Partial<MappingPlan>),
      HEADERS,
    );
    expect(badStatus.ok).toBe(false);

    const badTarget = validateMappingPlan(
      plan({
        columns: [
          { sourceHeader: "Full Name", target: "fullName" },
          { sourceHeader: "Site", target: "socialSecurityNumber" },
        ],
      } as unknown as Partial<MappingPlan>),
      HEADERS,
    );
    expect(badTarget.ok).toBe(false);
  });

  it("defaults a missing/invalid tagDelimiter to ';'", () => {
    const result = validateMappingPlan(plan({ tagDelimiter: "\t" } as unknown as Partial<MappingPlan>), HEADERS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.tagDelimiter).toBe(";");
  });
});

describe("applyMappingPlan", () => {
  const records = [
    HEADERS,
    ["Dana Whitfield", "dana@example.org", "555-0101", "Regular attender", "North"],
    ["Ortiz, Sam", "sam@example.org", "", "Member", ""],
    ["Cher", "", "", "", ""],
  ];

  function validated(): MappingPlan {
    const result = validateMappingPlan(plan(), HEADERS);
    if (!result.ok) throw new Error(result.errors.join("; "));
    return result.plan;
  }

  it("rewrites records into the canonical import shape", () => {
    const out = applyMappingPlan(records, validated());
    expect(out[0]).toEqual(["firstName", "lastName", "email", "phone", "membershipStatus", "tags", "campus"]);
    expect(out[1]).toEqual(["Dana", "Whitfield", "dana@example.org", "555-0101", "ATTENDER", "", "North"]);
  });

  it("splits 'Last, First' on the comma regardless of nameOrder", () => {
    const out = applyMappingPlan(records, validated());
    expect(out[2]!.slice(0, 2)).toEqual(["Sam", "Ortiz"]);
  });

  it("passes unmapped status values through for downstream row errors", () => {
    const rows = [HEADERS, ["Dana Whitfield", "", "", "Sunday regular", ""]];
    const out = applyMappingPlan(rows, validated());
    expect(out[1]![4]).toBe("Sunday regular");
    const mapped = mapImportRows(out, []);
    expect(mapped.errors[0]!.message).toContain('Unknown membershipStatus "Sunday regular"');
  });

  it("single-word full names become a missing-lastName row error downstream", () => {
    const out = applyMappingPlan(records, validated());
    expect(out[3]!.slice(0, 2)).toEqual(["Cher", ""]);
    const mapped = mapImportRows(out, []);
    expect(mapped.errors.some((e) => e.line === 4 && e.message.includes("required"))).toBe(true);
  });

  it("feeds mapImportRows end-to-end with status translation intact", () => {
    const out = applyMappingPlan(records, validated());
    const mapped = mapImportRows(out, [{ id: "c1", name: "North" }]);
    expect(mapped.rows[0]).toMatchObject({
      firstName: "Dana",
      lastName: "Whitfield",
      membershipStatus: MembershipStatus.ATTENDER,
      campusId: "c1",
    });
  });

  it("splits lastFirst full names without a comma", () => {
    const result = validateMappingPlan(
      plan({ columns: [{ sourceHeader: "Full Name", target: "fullName", nameOrder: "lastFirst" }] } as Partial<MappingPlan>),
      HEADERS,
    );
    if (!result.ok) throw new Error("plan invalid");
    const out = applyMappingPlan([HEADERS, ["Whitfield Dana Rae", "", "", "", ""]], result.plan);
    expect(out[1]!.slice(0, 2)).toEqual(["Dana Rae", "Whitfield"]);
  });

  it("normalizes tag delimiters to ';'", () => {
    const result = validateMappingPlan(
      plan({
        columns: [
          { sourceHeader: "Full Name", target: "fullName" },
          { sourceHeader: "Site", target: "tags" },
        ],
        tagDelimiter: ",",
      } as Partial<MappingPlan>),
      HEADERS,
    );
    if (!result.ok) throw new Error("plan invalid");
    const out = applyMappingPlan([HEADERS, ["Dana Whitfield", "", "", "", "youth, worship ,  greeter"]], result.plan);
    expect(out[1]![5]).toBe("youth;worship;greeter");
  });
});
