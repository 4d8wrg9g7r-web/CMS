/**
 * Pure Forms schema + validation (BLUEPRINT §7). No Prisma access, so it unit-tests
 * without a database and is safe to import from both the service layer and the public
 * submission page. Field definitions are stored as JSON on FormDefinition.draftSchema and
 * snapshotted immutably into FormVersion.schema on publish; this module is the single
 * interpreter of that JSON.
 */

export const FORM_FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "EMAIL",
  "PHONE",
  "NUMBER",
  "DATE",
  "DROPDOWN",
  "CHECKBOX",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Which Person attribute a field feeds when a submission matches/creates a Person. */
export type FormFieldMapping = "firstName" | "lastName" | "email" | "phone";
export const FORM_FIELD_MAPPINGS: FormFieldMapping[] = ["firstName", "lastName", "email", "phone"];

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  /** Options for DROPDOWN; ignored for other types. */
  options?: string[];
  /** Optional Person mapping. */
  mapsTo?: FormFieldMapping | null;
  helpText?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse a stored schema (unknown JSON) into a clean FormField[]. Tolerant: drops entries
 * that aren't well-formed rather than throwing, so a corrupt row can never crash a public
 * page. Normalizes options/mapsTo and coerces missing flags.
 */
export function parseSchema(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  const fields: FormField[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id : null;
    const label = typeof entry.label === "string" ? entry.label : null;
    const type = entry.type as FormFieldType;
    if (!id || !label || !FORM_FIELD_TYPES.includes(type)) continue;

    const options =
      type === "DROPDOWN" && Array.isArray(entry.options)
        ? entry.options.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
        : undefined;
    const mapsTo =
      typeof entry.mapsTo === "string" && (FORM_FIELD_MAPPINGS as string[]).includes(entry.mapsTo)
        ? (entry.mapsTo as FormFieldMapping)
        : null;

    fields.push({
      id,
      label,
      type,
      required: entry.required === true,
      options,
      mapsTo,
      helpText: typeof entry.helpText === "string" ? entry.helpText : undefined,
    });
  }
  return fields;
}

export interface ValidationResult {
  ok: boolean;
  /** Coerced values keyed by field id (present only when ok). */
  values: Record<string, unknown>;
  /** Human-readable errors keyed by field id. */
  errors: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate raw submitted values (strings from a form post, keyed by field id) against a
 * schema. Enforces required, coerces by type (number, checkbox, date), and checks
 * dropdown-option membership. Unknown keys are ignored. Returns coerced values on success.
 */
export function validateSubmission(fields: FormField[], raw: Record<string, unknown>): ValidationResult {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const rawValue = raw[field.id];
    const asString = typeof rawValue === "string" ? rawValue.trim() : rawValue == null ? "" : String(rawValue);

    // Empty handling.
    if (field.type === "CHECKBOX") {
      // A checkbox is a boolean; "on"/"true" => true, everything else false. Required
      // means "must be checked".
      const checked = rawValue === true || asString === "on" || asString === "true";
      if (field.required && !checked) {
        errors[field.id] = `${field.label} is required.`;
        continue;
      }
      values[field.id] = checked;
      continue;
    }

    if (asString === "") {
      if (field.required) {
        errors[field.id] = `${field.label} is required.`;
        continue;
      }
      values[field.id] = null;
      continue;
    }

    switch (field.type) {
      case "EMAIL":
        if (!EMAIL_RE.test(asString)) {
          errors[field.id] = `${field.label} must be a valid email.`;
        } else {
          values[field.id] = asString;
        }
        break;
      case "NUMBER": {
        const n = Number(asString);
        if (!Number.isFinite(n)) {
          errors[field.id] = `${field.label} must be a number.`;
        } else {
          values[field.id] = n;
        }
        break;
      }
      case "DATE": {
        const date = new Date(asString);
        if (Number.isNaN(date.getTime())) {
          errors[field.id] = `${field.label} must be a valid date.`;
        } else {
          values[field.id] = asString; // keep ISO date string as entered
        }
        break;
      }
      case "DROPDOWN":
        if (!(field.options ?? []).includes(asString)) {
          errors[field.id] = `${field.label} has an invalid selection.`;
        } else {
          values[field.id] = asString;
        }
        break;
      case "SHORT_TEXT":
      case "LONG_TEXT":
      case "PHONE":
      default:
        values[field.id] = asString;
        break;
    }
  }

  const ok = Object.keys(errors).length === 0;
  return { ok, values: ok ? values : {}, errors };
}

/**
 * Extract a Person input (firstName/lastName/email/phone) from validated values using each
 * field's `mapsTo`. Returns only the keys present. Used to match-or-create a Person from a
 * submission.
 */
export function extractPersonInput(
  fields: FormField[],
  values: Record<string, unknown>,
): { firstName?: string; lastName?: string; email?: string; phone?: string } {
  const out: { firstName?: string; lastName?: string; email?: string; phone?: string } = {};
  for (const field of fields) {
    if (!field.mapsTo) continue;
    const value = values[field.id];
    if (typeof value !== "string" || value.trim() === "") continue;
    out[field.mapsTo] = value.trim();
  }
  return out;
}
