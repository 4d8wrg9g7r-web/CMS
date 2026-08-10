import type { TaskPriority, TaskStatus } from "@cms/database";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function taskStatusTone(status: TaskStatus): BadgeTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "warning";
    case "IN_PROGRESS":
      return "info";
    case "OPEN":
    default:
      return "neutral";
  }
}

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export function taskPriorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? priority;
}

export function taskPriorityTone(priority: TaskPriority): BadgeTone {
  switch (priority) {
    case "URGENT":
      return "danger";
    case "HIGH":
      return "warning";
    case "LOW":
      return "neutral";
    case "NORMAL":
    default:
      return "info";
  }
}
