import { describe, expect, it } from "vitest";
import { extractPersonInput, parseSchema, validateSubmission, type FormField } from "../forms/schema";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

const fields: FormField[] = [
  { id: "f_first", label: "First name", type: "SHORT_TEXT", required: true, mapsTo: "firstName" },
  { id: "f_last", label: "Last name", type: "SHORT_TEXT", required: true, mapsTo: "lastName" },
  { id: "f_email", label: "Email", type: "EMAIL", required: true, mapsTo: "email" },
  { id: "f_age", label: "Age", type: "NUMBER", required: false },
  { id: "f_date", label: "Visit date", type: "DATE", required: false },
  { id: "f_interest", label: "Interest", type: "DROPDOWN", required: false, options: ["Groups", "Serving"] },
  { id: "f_news", label: "Newsletter", type: "CHECKBOX", required: false },
];

describe("parseSchema", () => {
  it("drops malformed entries and keeps valid fields", () => {
    const parsed = parseSchema([
      { id: "a", label: "A", type: "SHORT_TEXT", required: true },
      { id: "b", label: "B", type: "NOT_A_TYPE" },
      { label: "no id", type: "EMAIL" },
      "garbage",
      { id: "c", label: "C", type: "DROPDOWN", options: ["x", "", "y"], mapsTo: "email" },
    ]);
    expect(parsed.map((f) => f.id)).toEqual(["a", "c"]);
    const dropdown = parsed.find((f) => f.id === "c");
    expect(dropdown?.options).toEqual(["x", "y"]); // blank option filtered
    expect(dropdown?.mapsTo).toBe("email");
  });

  it("returns [] for non-array input", () => {
    expect(parseSchema(null)).toEqual([]);
    expect(parseSchema({})).toEqual([]);
  });
});

describe("validateSubmission", () => {
  it("accepts a valid submission and coerces types", () => {
    const result = validateSubmission(fields, {
      f_first: "Ada",
      f_last: "Lovelace",
      f_email: "ada@example.org",
      f_age: "36",
      f_interest: "Groups",
      f_news: "on",
    });
    expect(result.ok).toBe(true);
    expect(result.values.f_age).toBe(36);
    expect(result.values.f_news).toBe(true);
    expect(result.values.f_interest).toBe("Groups");
  });

  it("reports every missing required field", () => {
    const result = validateSubmission(fields, { f_first: "", f_last: "", f_email: "" });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(["f_email", "f_first", "f_last"]);
    expect(result.values).toEqual({});
  });

  it("rejects an invalid email and a non-numeric number", () => {
    const result = validateSubmission(fields, {
      f_first: "A",
      f_last: "B",
      f_email: "not-an-email",
      f_age: "abc",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.f_email).toMatch(/valid email/);
    expect(result.errors.f_age).toMatch(/number/);
  });

  it("rejects a dropdown value outside its options", () => {
    const result = validateSubmission(fields, {
      f_first: "A",
      f_last: "B",
      f_email: "a@b.co",
      f_interest: "Nonexistent",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.f_interest).toMatch(/invalid selection/);
  });

  it("treats an unchecked required checkbox as missing", () => {
    const requiredCheckbox: FormField[] = [{ id: "c", label: "Agree", type: "CHECKBOX", required: true }];
    expect(validateSubmission(requiredCheckbox, {}).ok).toBe(false);
    expect(validateSubmission(requiredCheckbox, { c: "on" }).ok).toBe(true);
  });

  it("ignores unknown keys not in the schema", () => {
    const result = validateSubmission(fields, {
      f_first: "A",
      f_last: "B",
      f_email: "a@b.co",
      injected: "malicious",
    });
    expect(result.ok).toBe(true);
    expect(result.values).not.toHaveProperty("injected");
  });
});

describe("extractPersonInput", () => {
  it("pulls mapped fields into a Person input", () => {
    const { values } = validateSubmission(fields, {
      f_first: "Ada",
      f_last: "Lovelace",
      f_email: "ada@example.org",
    });
    expect(extractPersonInput(fields, values)).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.org",
    });
  });

  it("returns an empty object when no fields map", () => {
    const unmapped: FormField[] = [{ id: "x", label: "X", type: "SHORT_TEXT", required: false }];
    const { values } = validateSubmission(unmapped, { x: "hello" });
    expect(extractPersonInput(unmapped, values)).toEqual({});
  });
});

describe("tenant guard registration (forms)", () => {
  it("registers FormDefinition, FormVersion, and FormSubmission as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("FormDefinition")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("FormVersion")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("FormSubmission")).toBe(true);
  });
});
