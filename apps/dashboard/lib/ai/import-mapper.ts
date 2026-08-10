import Anthropic from "@anthropic-ai/sdk";
import {
  buildColumnProfiles,
  validateMappingPlan,
  MAPPING_TARGETS,
  type MappingPlan,
} from "@cms/database";

/**
 * AI half of the assisted import (ADR-011). This module's ONLY job is to ask Claude
 * for a MappingPlan proposal from masked column profiles; the pure module in
 * @cms/database validates the proposal and applies it deterministically. Nothing in
 * here reads or writes the database, and full CSV rows never enter the prompt —
 * only headers plus per-column masked samples (emails/phones redacted upstream in
 * buildColumnProfiles).
 */

export const AI_IMPORT_MODEL = "claude-opus-5";

export function aiImportAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["columns", "statusRules", "tagDelimiter", "summary"],
  properties: {
    columns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceHeader", "target", "nameOrder", "customField"],
        properties: {
          sourceHeader: { type: "string" },
          target: { type: "string", enum: [...MAPPING_TARGETS] },
          nameOrder: { type: ["string", "null"], enum: ["firstLast", "lastFirst", null] },
          customField: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["label", "type"],
            properties: {
              label: { type: "string" },
              type: { type: "string", enum: ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"] },
            },
          },
        },
      },
    },
    statusRules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceValue", "status"],
        properties: {
          sourceValue: { type: "string" },
          status: { type: "string", enum: ["VISITOR", "ATTENDER", "MEMBER", "INACTIVE"] },
        },
      },
    },
    tagDelimiter: { type: "string", enum: [";", ",", "|"] },
    summary: { type: "string" },
  },
} as const;

const SYSTEM_PROMPT = `You map spreadsheet columns for a church management system's people import.

The import understands these built-in person fields: firstName, lastName, email, phone, membershipStatus, tags, campus. A single combined name column maps to "fullName" (set nameOrder to how names are written in the samples). A column that groups people into families/households (e.g. "Household", "Family Name") maps to "household". A column that is clearly person data but fits no built-in field (e.g. "Veteran", "Baptism Date", "Ministry Team", "T-Shirt Size") maps to "custom" with a customField: a clean human label and a storage type — BOOLEAN for yes/no shapes, DATE for dates, NUMBER for numbers, SELECT for a small repeated vocabulary, TEXT otherwise. Only columns that mean nothing for a person profile (row numbers, export timestamps, internal ids) map to "ignore".

Rules:
- Map a column to a built-in field only when the header or samples make its meaning clear. A plausible person attribute you cannot place goes to "custom", not "ignore" — the user confirms every column on its own review screen, so a suggested custom field is cheap and an ignored data column loses information.
- Never map financial, giving, health, or child-safety columns to anything but "ignore" — not even to "custom".
- customField must be null for every non-custom column.
- membershipStatus values must be translated with statusRules to VISITOR, ATTENDER, MEMBER, or INACTIVE (e.g. "Regular attender" → ATTENDER, "Moved away" → INACTIVE). Only write a rule for values that appear in the samples and clearly indicate a membership status; leave genuinely ambiguous values without a rule so they surface as row errors for a human to resolve.
- If a campus-like column's values do not resemble the organization's campus names, prefer "custom" (SELECT) or "ignore" and say why in the summary.
- The summary is shown to the person reviewing the plan: state in plain language what was mapped, which columns become new custom fields, what was ignored and why, and anything they should double-check.`;

export interface AnalyzeInput {
  records: string[][];
  campusNames: string[];
}

/**
 * Asks Claude for a mapping-plan proposal and returns it fully validated against the
 * file's real headers. Throws with a user-facing message when the key is missing or
 * the proposal fails validation (the caller surfaces it in the form).
 */
export async function proposeMappingPlan({ records, campusNames }: AnalyzeInput): Promise<MappingPlan> {
  if (!aiImportAvailable()) {
    throw new Error("AI-assisted import is not configured (missing ANTHROPIC_API_KEY).");
  }
  const headers = records[0] ?? [];
  const profiles = buildColumnProfiles(records);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: AI_IMPORT_MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: PLAN_SCHEMA } },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          columns: profiles,
          organizationCampusNames: campusNames,
          note: "samples are per-column distinct values; emails and phone numbers are masked",
        }),
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("The AI analysis returned no result — try again or import with exact headers.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.text);
  } catch {
    throw new Error("The AI analysis could not be read — try again or import with exact headers.");
  }

  const validated = validateMappingPlan(raw, headers);
  if (!validated.ok) {
    throw new Error(`The AI proposed an invalid mapping (${validated.errors[0]}). Try again or import with exact headers.`);
  }
  return validated.plan;
}
