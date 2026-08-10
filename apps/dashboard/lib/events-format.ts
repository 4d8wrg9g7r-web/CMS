import type { EventRecurrence } from "@cms/database";

export const RECURRENCE_OPTIONS: { value: EventRecurrence; label: string }[] = [
  { value: "NONE", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

export function recurrenceLabel(recurrence: EventRecurrence, interval: number): string {
  if (recurrence === "NONE") return "One-time";
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month" }[recurrence];
  return interval > 1 ? `Every ${interval} ${unit}s` : `Every ${unit}`;
}

export function formatEventDate(date: Date, allDay: boolean): string {
  return allDay
    ? date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : date.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
