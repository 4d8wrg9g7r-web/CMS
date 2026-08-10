import { MembershipStatus, PersonFieldType } from "@prisma/client";
import { IMPORT_HEADERS, type ImportRowError } from "./import";
import { coerceFieldValue, MAX_SELECT_OPTIONS, slugifyFieldKey, type PersonFieldValueJson } from "./custom-fields";

/**
 * Pure half of AI-assisted import mapping (docs/domain/people-import.md, ADR-011).
 * The model only ever PROPOSES a MappingPlan; everything that touches real data —
 * building the masked column profiles sent to the API, validating the returned plan,
 * and applying it to the CSV — is deterministic, unit-tested code in this module.
 */

/** Max distinct sample values per column included in a profile. */
export const PROFILE_SAMPLE_LIMIT = 8;

export interface ColumnProfile {
  header: string;
  /** Distinct non-empty values, masked, capped at PROFILE_SAMPLE_LIMIT. */
  samples: string[];
  distinctCount: number;
  emptyCount: number;
  rowCount: number;
}

export const MAPPING_TARGETS = [...IMPORT_HEADERS, "fullName", "household", "custom", "ignore"] as const;
export type MappingTarget = (typeof MAPPING_TARGETS)[number];

/** Spec for a column imported as an org-defined custom field. */
export interface MappingCustomField {
  key: string;
  label: string;
  type: PersonFieldType;
}

export interface MappingColumn {
  sourceHeader: string;
  target: MappingTarget;
  /** Only meaningful when target is fullName: which name comes first in the value. */
  nameOrder?: "firstLast" | "lastFirst" | null;
  /** Required when target is "custom": how to store the column. */
  customField?: MappingCustomField | null;
}

export interface MappingPlan {
  columns: MappingColumn[];
  /** Source-value → membershipStatus translations (e.g. "Regular attender" → ATTENDER). */
  statusRules: { sourceValue: string; status: MembershipStatus }[];
  tagDelimiter: ";" | "," | "|";
  /** One-paragraph human-readable explanation, shown verbatim in the review UI. */
  summary: string;
}

/**
 * Masks a single cell value before it can leave the process: anything email-shaped
 * loses its local part, anything with 7+ digits (phone-shaped) loses its digits.
 * Other values (statuses, tags, campus names, dates) pass through — the model needs
 * them raw to propose value translations.
 */
export function maskImportValue(value: string): string {
  const v = value.trim();
  const at = v.indexOf("@");
  if (at > 0 && v.indexOf(" ") === -1) {
    return `${v[0]}***@${v.slice(at + 1)}`;
  }
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 7) return v.replace(/\d/g, "#");
  return v;
}

/**
 * Builds the per-column profiles sent to the model: header, masked distinct samples,
 * and counts. `records` includes the header row (same shape parseCsv returns).
 */
export function buildColumnProfiles(records: string[][]): ColumnProfile[] {
  if (records.length === 0) return [];
  const header = records[0]!;
  return header.map((name, col) => {
    const distinct = new Set<string>();
    const samples: string[] = [];
    let emptyCount = 0;
    for (let r = 1; r < records.length; r++) {
      const raw = (records[r]![col] ?? "").trim();
      if (!raw) {
        emptyCount++;
        continue;
      }
      const key = raw.toLowerCase();
      if (distinct.has(key)) continue;
      distinct.add(key);
      if (samples.length < PROFILE_SAMPLE_LIMIT) samples.push(maskImportValue(raw));
    }
    return {
      header: name.trim(),
      samples,
      distinctCount: distinct.size,
      emptyCount,
      rowCount: records.length - 1,
    };
  });
}

/** Max distinct raw values per column surfaced to the import wizard UI. */
export const WIZARD_VALUE_LIMIT = 12;

export interface WizardColumn {
  header: string;
  /** Distinct raw values (first-seen casing), capped at WIZARD_VALUE_LIMIT. Shown only
   * to the importing user in their own browser — nothing here goes to the AI, which
   * gets the masked profiles from buildColumnProfiles instead. */
  values: string[];
  distinctCount: number;
  emptyCount: number;
  rowCount: number;
}

/** Per-column raw data backing the wizard's one-question-per-screen flow. */
export function buildWizardColumns(records: string[][]): WizardColumn[] {
  if (records.length === 0) return [];
  const header = records[0]!;
  return header.map((name, col) => {
    const distinct = new Set<string>();
    const values: string[] = [];
    let emptyCount = 0;
    for (let r = 1; r < records.length; r++) {
      const raw = (records[r]![col] ?? "").trim();
      if (!raw) {
        emptyCount++;
        continue;
      }
      const key = raw.toLowerCase();
      if (distinct.has(key)) continue;
      distinct.add(key);
      if (values.length < WIZARD_VALUE_LIMIT) values.push(raw);
    }
    return { header: name.trim(), values, distinctCount: distinct.size, emptyCount, rowCount: records.length - 1 };
  });
}

const HEADER_ALIASES: Record<string, MappingTarget> = {
  firstname: "firstName",
  first: "firstName",
  fname: "firstName",
  givenname: "firstName",
  forename: "firstName",
  lastname: "lastName",
  last: "lastName",
  lname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  name: "fullName",
  fullname: "fullName",
  personname: "fullName",
  displayname: "fullName",
  email: "email",
  emailaddress: "email",
  mail: "email",
  primaryemail: "email",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  mobilephone: "phone",
  cell: "phone",
  cellphone: "phone",
  telephone: "phone",
  primaryphone: "phone",
  homephone: "phone",
  membershipstatus: "membershipStatus",
  memberstatus: "membershipStatus",
  membership: "membershipStatus",
  membertype: "membershipStatus",
  status: "membershipStatus",
  tags: "tags",
  tag: "tags",
  labels: "tags",
  keywords: "tags",
  campus: "campus",
  site: "campus",
  location: "campus",
  branch: "campus",
  congregation: "campus",
  household: "household",
  householdname: "household",
};

/**
 * Deterministic fallback proposal when no AI key is configured (or the AI call fails):
 * alias-matches headers to targets. First match wins a target; the rest default to
 * ignore. fullName defers to explicit first/last columns when both exist.
 */
export function guessMappingColumns(headers: string[]): MappingColumn[] {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const taken = new Set<string>();
  const guesses: MappingColumn[] = headers.map((header, i) => {
    const target = HEADER_ALIASES[normalized[i] ?? ""] ?? "ignore";
    if (target === "ignore" || taken.has(target)) return { sourceHeader: header.trim(), target: "ignore", nameOrder: null };
    taken.add(target);
    return { sourceHeader: header.trim(), target, nameOrder: target === "fullName" ? "firstLast" : null };
  });
  // "Name" next to explicit First/Last columns is usually a duplicate — don't fight them.
  if (taken.has("fullName") && taken.has("firstName") && taken.has("lastName")) {
    for (const g of guesses) if (g.target === "fullName") g.target = "ignore";
  }
  return guesses;
}

/** Picks the likeliest multi-tag separator from real column values. */
export function detectTagDelimiter(values: string[]): ";" | "," | "|" {
  for (const d of [";", ",", "|"] as const) {
    if (values.some((v) => v.includes(d))) return d;
  }
  return ";";
}

const VALID_STATUSES = new Set<string>(Object.values(MembershipStatus));
const VALID_TARGETS = new Set<string>(MAPPING_TARGETS);
const VALID_DELIMITERS = new Set([";", ",", "|"]);

export type PlanValidation = { ok: true; plan: MappingPlan } | { ok: false; errors: string[] };

/**
 * Structurally validates an untrusted plan (model output OR round-tripped client
 * JSON — both go through here) against the file's actual headers. Rejects unknown
 * headers/targets/statuses, duplicate assignments, and incoherent name coverage.
 */
export function validateMappingPlan(input: unknown, headers: string[]): PlanValidation {
  const errors: string[] = [];
  const plan = input as Partial<MappingPlan> | null;
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.columns) || !Array.isArray(plan.statusRules)) {
    return { ok: false, errors: ["The mapping plan is malformed."] };
  }

  const headerSet = new Map(headers.map((h) => [h.trim().toLowerCase(), h.trim()]));
  const seenHeaders = new Set<string>();
  const seenTargets = new Set<string>();
  const seenCustomKeys = new Set<string>();
  const validFieldTypes = new Set<string>(Object.values(PersonFieldType));
  const columns: MappingColumn[] = [];

  for (const col of plan.columns) {
    if (!col || typeof col !== "object" || typeof col.sourceHeader !== "string" || typeof col.target !== "string") {
      errors.push("A column mapping entry is malformed.");
      continue;
    }
    const headerKey = col.sourceHeader.trim().toLowerCase();
    const canonical = headerSet.get(headerKey);
    if (!canonical) {
      errors.push(`Mapped column "${col.sourceHeader}" does not exist in the file.`);
      continue;
    }
    if (seenHeaders.has(headerKey)) {
      errors.push(`Column "${col.sourceHeader}" is mapped more than once.`);
      continue;
    }
    seenHeaders.add(headerKey);
    if (!VALID_TARGETS.has(col.target)) {
      errors.push(`Unknown mapping target "${col.target}".`);
      continue;
    }
    // Any number of columns may become custom fields; every other target is single-use.
    if (col.target !== "ignore" && col.target !== "custom") {
      if (seenTargets.has(col.target)) errors.push(`Two columns are both mapped to ${col.target}.`);
      seenTargets.add(col.target);
    }
    let customField: MappingCustomField | null = null;
    if (col.target === "custom") {
      const cf = col.customField;
      if (!cf || typeof cf !== "object" || !validFieldTypes.has(String(cf.type))) {
        errors.push(`Column "${canonical}" is missing a valid custom-field type.`);
        continue;
      }
      const label = typeof cf.label === "string" && cf.label.trim() ? cf.label.trim() : canonical;
      const key = slugifyFieldKey(typeof cf.key === "string" && cf.key.trim() ? cf.key : label);
      if (!key) {
        errors.push(`Column "${canonical}" produces an empty custom-field key.`);
        continue;
      }
      if (seenCustomKeys.has(key)) {
        errors.push(`Two columns map to the same custom field "${key}".`);
        continue;
      }
      seenCustomKeys.add(key);
      customField = { key, label, type: cf.type as PersonFieldType };
    }
    const nameOrder = col.nameOrder === "firstLast" || col.nameOrder === "lastFirst" ? col.nameOrder : null;
    columns.push({ sourceHeader: canonical, target: col.target as MappingTarget, nameOrder, customField });
  }

  if (seenTargets.has("fullName") && (seenTargets.has("firstName") || seenTargets.has("lastName"))) {
    errors.push("fullName cannot be combined with firstName/lastName mappings.");
  }
  if (!seenTargets.has("fullName") && !(seenTargets.has("firstName") && seenTargets.has("lastName"))) {
    errors.push("The plan must map firstName and lastName (or a single fullName column).");
  }

  const statusRules: MappingPlan["statusRules"] = [];
  const seenValues = new Set<string>();
  for (const rule of plan.statusRules) {
    if (!rule || typeof rule !== "object" || typeof rule.sourceValue !== "string" || !rule.sourceValue.trim()) {
      errors.push("A status rule is malformed.");
      continue;
    }
    if (!VALID_STATUSES.has(String(rule.status))) {
      errors.push(`Status rule "${rule.sourceValue}" targets unknown status "${String(rule.status)}".`);
      continue;
    }
    const key = rule.sourceValue.trim().toLowerCase();
    if (seenValues.has(key)) {
      errors.push(`Status value "${rule.sourceValue}" has more than one rule.`);
      continue;
    }
    seenValues.add(key);
    statusRules.push({ sourceValue: rule.sourceValue.trim(), status: rule.status as MembershipStatus });
  }

  const tagDelimiter = VALID_DELIMITERS.has(String(plan.tagDelimiter)) ? (plan.tagDelimiter as MappingPlan["tagDelimiter"]) : ";";

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    plan: { columns, statusRules, tagDelimiter, summary: typeof plan.summary === "string" ? plan.summary : "" },
  };
}

/** Splits a full name. A comma always means "Last, First"; otherwise nameOrder decides. */
function splitFullName(value: string, nameOrder: MappingColumn["nameOrder"]): { firstName: string; lastName: string } {
  const v = value.trim().replace(/\s+/g, " ");
  const comma = v.indexOf(",");
  if (comma !== -1) {
    return { lastName: v.slice(0, comma).trim(), firstName: v.slice(comma + 1).trim() };
  }
  const parts = v.split(" ");
  if (parts.length < 2) return { firstName: v, lastName: "" };
  if (nameOrder === "lastFirst") {
    return { lastName: parts[0]!, firstName: parts.slice(1).join(" ") };
  }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1]! };
}

/**
 * Deterministically rewrites the original CSV records into the canonical import shape
 * (IMPORT_HEADERS header row + translated values), ready for mapImportRows. Status
 * values with no rule pass through untouched — the downstream row validator reports
 * them per line rather than this code silently guessing.
 */
export function applyMappingPlan(records: string[][], plan: MappingPlan): string[][] {
  if (records.length === 0) return records;
  const header = records[0]!.map((h) => h.trim().toLowerCase());
  const colIndex = new Map<string, number>();
  for (const col of plan.columns) {
    // custom/household columns are handled by extractExtraColumns, not the canonical shape.
    if (col.target === "ignore" || col.target === "custom" || col.target === "household") continue;
    colIndex.set(col.target, header.indexOf(col.sourceHeader.trim().toLowerCase()));
  }
  const fullNameCol = plan.columns.find((c) => c.target === "fullName");
  const statusByValue = new Map(plan.statusRules.map((r) => [r.sourceValue.toLowerCase(), r.status]));
  const canonicalStatus = new Map(Object.values(MembershipStatus).map((s) => [s.toLowerCase(), s]));
  const get = (record: string[], target: MappingTarget) => {
    const idx = colIndex.get(target);
    return idx === undefined || idx === -1 ? "" : (record[idx] ?? "").trim();
  };

  const out: string[][] = [[...IMPORT_HEADERS]];
  for (let r = 1; r < records.length; r++) {
    const record = records[r]!;
    let firstName = get(record, "firstName");
    let lastName = get(record, "lastName");
    if (fullNameCol) {
      const split = splitFullName(get(record, "fullName"), fullNameCol.nameOrder);
      firstName = split.firstName;
      lastName = split.lastName;
    }
    const rawStatus = get(record, "membershipStatus");
    // Rule match first, then canonical uppercase for values that already are the enum
    // (so previews read consistently); anything else passes through to a row error.
    const status = rawStatus
      ? (statusByValue.get(rawStatus.toLowerCase()) ?? canonicalStatus.get(rawStatus.toLowerCase()) ?? rawStatus)
      : "";
    const tags = get(record, "tags")
      .split(plan.tagDelimiter)
      .map((t) => t.trim())
      .filter(Boolean)
      .join(";");
    out.push([firstName, lastName, get(record, "email"), get(record, "phone"), status, tags, get(record, "campus")]);
  }
  return out;
}

/** A custom field an import run will write, resolved against the org's existing defs. */
export interface ResolvedImportField {
  key: string;
  label: string;
  type: PersonFieldType;
  /** Full option set after this run (existing options ∪ new file values) for selects. */
  options: string[];
  existing: boolean;
}

export interface ExtraColumnValues {
  householdName: string | null;
  custom: Record<string, PersonFieldValueJson>;
}

/**
 * Companion to applyMappingPlan for the non-canonical targets: pulls per-line
 * household names and coerced custom-field values out of the original records.
 * An existing org definition with the same key always wins over the plan's proposed
 * type, so re-imports can't silently retype a field; SELECT options are derived
 * from (or extended with) the file's own values, and a SELECT whose file exceeds
 * MAX_SELECT_OPTIONS distinct values degrades to TEXT rather than exploding the
 * dropdown. Coercion failures are per-line errors — those rows are excluded, same
 * as an unknown campus.
 */
export function extractExtraColumns(
  records: string[][],
  plan: MappingPlan,
  existingFields: { key: string; label: string; type: PersonFieldType; options: string[] }[],
): { fields: ResolvedImportField[]; byLine: Map<number, ExtraColumnValues>; errors: ImportRowError[] } {
  const byLine = new Map<number, ExtraColumnValues>();
  const errors: ImportRowError[] = [];
  if (records.length === 0) return { fields: [], byLine, errors };

  const header = records[0]!.map((h) => h.trim().toLowerCase());
  const existingByKey = new Map(existingFields.map((f) => [f.key, f]));
  const householdCol = plan.columns.find((c) => c.target === "household");
  const householdIdx = householdCol ? header.indexOf(householdCol.sourceHeader.trim().toLowerCase()) : -1;

  const customCols: { idx: number; field: ResolvedImportField }[] = [];
  const fields: ResolvedImportField[] = [];
  for (const col of plan.columns) {
    if (col.target !== "custom" || !col.customField) continue;
    const idx = header.indexOf(col.sourceHeader.trim().toLowerCase());
    if (idx === -1) continue;

    const existing = existingByKey.get(col.customField.key);
    let type = existing?.type ?? col.customField.type;
    // Distinct raw values in this file's column, for select-option derivation.
    const distinct = new Map<string, string>();
    for (let r = 1; r < records.length; r++) {
      const raw = (records[r]![idx] ?? "").trim();
      if (raw) distinct.set(raw.toLowerCase(), raw);
    }
    let options = existing?.options ?? [];
    if (type === PersonFieldType.SELECT || type === PersonFieldType.MULTI_SELECT) {
      const known = new Set(options.map((o) => o.toLowerCase()));
      const merged = [...options, ...[...distinct.values()].filter((v) => !known.has(v.toLowerCase()))];
      if (!existing && merged.length > MAX_SELECT_OPTIONS) {
        type = PersonFieldType.TEXT;
        options = [];
      } else {
        options = merged;
      }
    } else {
      options = existing?.options ?? [];
    }

    const field: ResolvedImportField = {
      key: col.customField.key,
      label: existing?.label ?? col.customField.label,
      type,
      options,
      existing: Boolean(existing),
    };
    fields.push(field);
    customCols.push({ idx, field });
  }

  for (let r = 1; r < records.length; r++) {
    const record = records[r]!;
    const line = r + 1;
    const custom: Record<string, PersonFieldValueJson> = {};
    let lineOk = true;
    for (const { idx, field } of customCols) {
      const raw = (record[idx] ?? "").trim();
      const result = coerceFieldValue(field.type, raw, plan.tagDelimiter);
      if (!result.ok) {
        errors.push({ line, message: `${field.label}: ${result.message}` });
        lineOk = false;
        continue;
      }
      if (result.value !== null) custom[field.key] = result.value;
    }
    if (!lineOk) continue;
    const householdName = householdIdx === -1 ? null : (record[householdIdx] ?? "").trim() || null;
    byLine.set(line, { householdName, custom });
  }

  return { fields, byLine, errors };
}
