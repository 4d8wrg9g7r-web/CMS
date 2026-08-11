import type { ContributionMethod } from "@cms/database";

export const CONTRIBUTION_METHOD_OPTIONS: { value: ContributionMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "CARD", label: "Card" },
  { value: "ACH", label: "Bank transfer (ACH)" },
  { value: "OTHER", label: "Other" },
];

// ONLINE rows are webhook-recorded, never hand-entered — label it for display
// but keep it out of the manual-entry options above.
export function contributionMethodLabel(method: ContributionMethod): string {
  if (method === "ONLINE") return "Online";
  return CONTRIBUTION_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method;
}

/** UTC date → "Jan 5, 2026" (giving dates are date-only, stored at UTC midnight). */
export function givingDate(date: Date): string {
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/** Today as the value for a date input, in UTC. */
export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}
