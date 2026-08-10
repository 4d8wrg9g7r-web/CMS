import { MembershipStatus } from "@prisma/client";
import { IMPORT_HEADERS } from "./import";

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

export const MAPPING_TARGETS = [...IMPORT_HEADERS, "fullName", "ignore"] as const;
export type MappingTarget = (typeof MAPPING_TARGETS)[number];

export interface MappingColumn {
  sourceHeader: string;
  target: MappingTarget;
  /** Only meaningful when target is fullName: which name comes first in the value. */
  nameOrder?: "firstLast" | "lastFirst" | null;
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
    if (col.target !== "ignore") {
      if (seenTargets.has(col.target)) errors.push(`Two columns are both mapped to ${col.target}.`);
      seenTargets.add(col.target);
    }
    const nameOrder = col.nameOrder === "firstLast" || col.nameOrder === "lastFirst" ? col.nameOrder : null;
    columns.push({ sourceHeader: canonical, target: col.target as MappingTarget, nameOrder });
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
    colIndex.set(col.target === "ignore" ? `ignore:${col.sourceHeader}` : col.target, header.indexOf(col.sourceHeader.trim().toLowerCase()));
  }
  const fullNameCol = plan.columns.find((c) => c.target === "fullName");
  const statusByValue = new Map(plan.statusRules.map((r) => [r.sourceValue.toLowerCase(), r.status]));
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
    const status = rawStatus ? (statusByValue.get(rawStatus.toLowerCase()) ?? rawStatus) : "";
    const tags = get(record, "tags")
      .split(plan.tagDelimiter)
      .map((t) => t.trim())
      .filter(Boolean)
      .join(";");
    out.push([firstName, lastName, get(record, "email"), get(record, "phone"), status, tags, get(record, "campus")]);
  }
  return out;
}
