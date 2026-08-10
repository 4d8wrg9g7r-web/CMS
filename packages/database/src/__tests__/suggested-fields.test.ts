import { describe, expect, it } from "vitest";
import { PersonFieldType } from "@prisma/client";
import { matchSuggestedField, SUGGESTED_PERSON_FIELDS } from "../people/suggested-fields";
import { guessMappingColumns } from "../people/import-mapping";
import { slugifyFieldKey } from "../people/custom-fields";

const normalize = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

describe("SUGGESTED_PERSON_FIELDS catalog integrity", () => {
  it("holds exactly 200 fields", () => {
    expect(SUGGESTED_PERSON_FIELDS).toHaveLength(200);
  });

  it("has unique keys, all already in slug form", () => {
    const keys = SUGGESTED_PERSON_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of SUGGESTED_PERSON_FIELDS) {
      expect(f.key).toBe(slugifyFieldKey(f.key));
      expect(f.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate matchable names across keys, labels, and aliases", () => {
    const seen = new Map<string, string>();
    for (const f of SUGGESTED_PERSON_FIELDS) {
      for (const name of [f.key, f.label, ...f.aliases]) {
        const n = normalize(name);
        const owner = seen.get(n);
        expect(owner === undefined || owner === f.key, `"${name}" claimed by ${owner} and ${f.key}`).toBe(true);
        seen.set(n, f.key);
      }
    }
  });

  it("uses only valid field types", () => {
    const valid = new Set(Object.values(PersonFieldType));
    for (const f of SUGGESTED_PERSON_FIELDS) expect(valid.has(f.type)).toBe(true);
  });

  it("never shadows a built-in import target", () => {
    // These headers must keep resolving to built-ins, not catalog suggestions.
    const builtins = ["First Name", "Last Name", "Full Name", "Email", "Mobile Phone", "Status", "Tags", "Campus", "Household"];
    const guesses = guessMappingColumns(builtins);
    expect(guesses.every((g) => g.target !== "custom")).toBe(true);
  });
});

describe("matchSuggestedField", () => {
  it("matches by key, label, and alias, ignoring case and punctuation", () => {
    expect(matchSuggestedField("Baptism Date")?.type).toBe(PersonFieldType.DATE);
    expect(matchSuggestedField("DOB")?.key).toBe("date-of-birth");
    expect(matchSuggestedField("Zip")?.key).toBe("postal-code");
    expect(matchSuggestedField("T-Shirt Size")?.type).toBe(PersonFieldType.SELECT);
    expect(matchSuggestedField("BACKGROUND CHECK")?.type).toBe(PersonFieldType.BOOLEAN);
    expect(matchSuggestedField("Total Giving 2025")).toBeNull();
  });
});

describe("guessMappingColumns with the catalog", () => {
  it("pre-proposes typed custom fields for recognized non-built-in headers", () => {
    const guesses = guessMappingColumns(["Full Name", "Email", "Veteran", "Baptism Date", "Favorite Color"]);
    expect(guesses[2]).toMatchObject({
      target: "custom",
      customField: { key: "veteran", label: "Veteran", type: PersonFieldType.BOOLEAN },
    });
    expect(guesses[3]).toMatchObject({
      target: "custom",
      customField: { key: "baptism-date", type: PersonFieldType.DATE },
    });
    expect(guesses[4]!.target).toBe("ignore");
  });

  it("keeps Home Phone as its own field next to a mobile column", () => {
    const guesses = guessMappingColumns(["Full Name", "Mobile Phone", "Home Phone"]);
    expect(guesses[1]!.target).toBe("phone");
    expect(guesses[2]).toMatchObject({ target: "custom", customField: { key: "home-phone" } });
  });

  it("does not propose the same catalog field for two columns", () => {
    const guesses = guessMappingColumns(["DOB", "Birthdate"]);
    expect(guesses[0]!.target).toBe("custom");
    expect(guesses[1]!.target).toBe("ignore");
  });
});
