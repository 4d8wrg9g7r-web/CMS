import { PersonFieldType } from "@prisma/client";

/**
 * Pure custom-person-field helpers (docs/domain/people.md "Custom fields"). No I/O:
 * type inference, key slugging, and value coercion are all deterministic and
 * unit-tested here; persistence lives in services/people-service.ts.
 */

export const PERSON_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"] as const;

/** JSON value shapes a PersonFieldValue may hold, by definition type. */
export type PersonFieldValueJson = string | number | boolean | string[];

/** Max distinct values a column may have and still be offered/derived as a dropdown. */
export const MAX_SELECT_OPTIONS = 24;

/** "Veteran Status (Y/N)" → "veteran-status-y-n" — the stable per-org field key. */
export function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const TRUE_WORDS = new Set(["yes", "y", "true", "1", "x", "✓", "✔"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0"]);

/** Parses common spreadsheet date shapes to a UTC date, or null. */
function parseDate(raw: string): Date | null {
  const v = raw.trim();
  let y = 0;
  let m = 0;
  let d = 0;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (us) {
    m = Number(us[1]);
    d = Number(us[2]);
    y = Number(us[3]);
    if (y < 100) y += y >= 30 ? 1900 : 2000;
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject rollovers like 2/31 → 3/2.
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

function isNumeric(raw: string): boolean {
  return /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(raw.trim());
}

/**
 * Suggests a field type from a column's non-empty values: every value boolean-ish →
 * BOOLEAN, every value a date → DATE, every value numeric → NUMBER, a small closed
 * vocabulary → SELECT, anything else → TEXT. Purely a wizard default — the user
 * confirms or overrides it on the "How should this be stored?" screen.
 */
export function inferFieldType(values: string[], distinctCount: number): PersonFieldType {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return PersonFieldType.TEXT;
  if (nonEmpty.every((v) => TRUE_WORDS.has(v.toLowerCase()) || FALSE_WORDS.has(v.toLowerCase()))) {
    return PersonFieldType.BOOLEAN;
  }
  if (nonEmpty.every((v) => parseDate(v) !== null)) return PersonFieldType.DATE;
  if (nonEmpty.every((v) => isNumeric(v))) return PersonFieldType.NUMBER;
  if (distinctCount <= 8 && distinctCount < nonEmpty.length) return PersonFieldType.SELECT;
  return PersonFieldType.TEXT;
}

export type CoerceResult = { ok: true; value: PersonFieldValueJson | null } | { ok: false; message: string };

/**
 * Converts one raw cell into the JSON value stored for a field of the given type.
 * Empty → null (no value row written). Unparseable BOOLEAN/NUMBER/DATE values are
 * errors — corrupting a typed field silently is worse than flagging the row.
 * SELECT/MULTI_SELECT never fail here: on import, options are derived from (or
 * extended with) the file's own values.
 */
export function coerceFieldValue(type: PersonFieldType, raw: string, tagDelimiter = ";"): CoerceResult {
  const v = raw.trim();
  if (!v) return { ok: true, value: null };
  switch (type) {
    case PersonFieldType.BOOLEAN: {
      const lower = v.toLowerCase();
      if (TRUE_WORDS.has(lower)) return { ok: true, value: true };
      if (FALSE_WORDS.has(lower)) return { ok: true, value: false };
      return { ok: false, message: `"${v}" is not a yes/no value.` };
    }
    case PersonFieldType.NUMBER: {
      if (!isNumeric(v)) return { ok: false, message: `"${v}" is not a number.` };
      return { ok: true, value: Number(v.replace(/,/g, "")) };
    }
    case PersonFieldType.DATE: {
      const date = parseDate(v);
      if (!date) return { ok: false, message: `"${v}" is not a date (use YYYY-MM-DD or MM/DD/YYYY).` };
      return { ok: true, value: date.toISOString().slice(0, 10) };
    }
    case PersonFieldType.MULTI_SELECT:
      return {
        ok: true,
        value: v
          .split(tagDelimiter)
          .map((s) => s.trim())
          .filter(Boolean),
      };
    case PersonFieldType.SELECT:
    case PersonFieldType.TEXT:
      return { ok: true, value: v };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** Human-readable value for display, given the stored JSON. */
export function formatFieldValue(type: PersonFieldType, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (type === PersonFieldType.BOOLEAN) return value === true ? "Yes" : "No";
  if (type === PersonFieldType.MULTI_SELECT && Array.isArray(value)) return value.join(", ");
  return String(value);
}
