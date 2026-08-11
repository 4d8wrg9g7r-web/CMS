import Anthropic from "@anthropic-ai/sdk";
import type { ReportConfig } from "@cms/database";

/**
 * "Closed" AI reporting (docs/domain/reports.md): Claude translates a natural-
 * language question into a ReportConfig — it NEVER sees records. The prompt
 * contains only the question and schema-level metadata (source/dimension/measure
 * vocabulary, fund/campus/event names+ids, custom field labels). No people, no
 * amounts, no aggregates leave the system; the returned config runs through the
 * same validateReportConfig + permission checks + local pipeline as a hand-built
 * report. Same propose/dispose boundary as ADR-011.
 */

export const AI_REPORT_MODEL = "claude-opus-5";

export function aiReportsAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ReportAiMetadata {
  allowedSources: string[];
  campuses: { id: string; name: string }[];
  funds: { id: string; name: string; taxDeductible: boolean }[];
  events: { id: string; name: string }[];
  customFields: { key: string; label: string; type: string; options: string[] }[];
}

const CONFIG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["source", "from", "to", "groupKind", "bucket", "field", "measure", "chart", "compare", "filters", "explanation"],
  properties: {
    source: { type: "string", enum: ["people", "attendance", "giving"] },
    from: { type: ["string", "null"] },
    to: { type: ["string", "null"] },
    groupKind: { type: "string", enum: ["time", "dimension"] },
    bucket: { type: ["string", "null"], enum: ["week", "month", "year", null] },
    field: { type: ["string", "null"] },
    measure: { type: "string", enum: ["count", "uniquePeople", "sumAmount"] },
    chart: { type: "string", enum: ["bar", "line", "pie", "donut", "table"] },
    compare: { type: ["string", "null"], enum: ["previousPeriod", "previousYear", null] },
    filters: {
      type: "object",
      additionalProperties: false,
      required: ["membershipStatus", "campusId", "fundId", "method", "eventId", "customFieldKey", "customFieldValue"],
      properties: {
        membershipStatus: { type: ["string", "null"], enum: ["VISITOR", "ATTENDER", "MEMBER", "INACTIVE", null] },
        campusId: { type: ["string", "null"] },
        fundId: { type: ["string", "null"] },
        method: { type: ["string", "null"], enum: ["CASH", "CHECK", "CARD", "ACH", "OTHER", null] },
        eventId: { type: ["string", "null"] },
        customFieldKey: { type: ["string", "null"] },
        customFieldValue: { type: ["string", "null"] },
      },
    },
    explanation: { type: "string" },
  },
} as const;

const SYSTEM_PROMPT = `You translate a church staff member's question into a report configuration for their church management system. You only ever see the question and the organization's schema vocabulary — never any records, names of members, amounts, or results.

Sources and their date fields: "people" (date a person was added), "attendance" (check-in date), "giving" (gift date).
Measures: people supports only count; attendance supports count and uniquePeople; giving supports sumAmount (default for money questions), count, and uniquePeople.
Grouping: groupKind "time" with bucket week/month/year (set field to null), or groupKind "dimension" with field set to one of: membershipStatus, campus, or "custom:<key>" for a listed custom field; attendance also allows "event"; giving also allows "fund" and "method" (set bucket to null).
Filters: use ids from the provided lists for campusId/fundId/eventId; customFieldKey must be a listed key with customFieldValue set ("Yes"/"No" for yes-no fields).
Charts: line for over-time questions, bar for category comparisons, pie or donut for share-of-total, table when the user asks for exact numbers.
Compare: when the question compares two periods ("this year vs last year", "compared to the previous quarter"), set compare to "previousYear" or "previousPeriod" — from/to must then be explicit dates for the CURRENT period, never null. Otherwise compare is null.
Dates: from/to are YYYY-MM-DD or null (all time). Compute relative ranges ("last quarter", "this year") from the provided today's date.
If the question is ambiguous, pick the most reasonable reading and state the assumption in the explanation. The explanation is one or two sentences, plain language, describing exactly what the report shows.
If the question asks for something the report engine cannot express (per-person lists, predictions, comparisons of two measures at once), choose the nearest expressible report and say what you approximated in the explanation.`;

export interface ReportAiAnswer {
  config: ReportConfig;
  explanation: string;
}

export async function askReportAssistant(input: {
  question: string;
  metadata: ReportAiMetadata;
  currentConfig?: unknown;
}): Promise<ReportAiAnswer> {
  if (!aiReportsAvailable()) throw new Error("AI reporting is not configured (missing ANTHROPIC_API_KEY).");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: AI_REPORT_MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: CONFIG_SCHEMA } },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          question: input.question,
          today: new Date().toISOString().slice(0, 10),
          ...input.metadata,
          currentConfig: input.currentConfig ?? null,
          note: "currentConfig is the report the user is looking at now — follow-up questions refine it.",
        }),
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error("The assistant returned no result — try rephrasing.");
  let raw: {
    source: string;
    from: string | null;
    to: string | null;
    groupKind: string;
    bucket: string | null;
    field: string | null;
    measure: string;
    chart: string;
    compare: string | null;
    filters: Record<string, string | null>;
    explanation: string;
  };
  try {
    raw = JSON.parse(text.text);
  } catch {
    throw new Error("The assistant's answer could not be read — try rephrasing.");
  }

  const config = {
    source: raw.source,
    from: raw.from,
    to: raw.to,
    groupBy:
      raw.groupKind === "time"
        ? { kind: "time" as const, bucket: (raw.bucket ?? "month") as "week" | "month" | "year" }
        : { kind: "dimension" as const, field: raw.field ?? "membershipStatus" },
    measure: raw.measure,
    chart: raw.chart,
    compare: raw.compare,
    filters: raw.filters,
  } as ReportConfig;

  return { config, explanation: raw.explanation };
}
