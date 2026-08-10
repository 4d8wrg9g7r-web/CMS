type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const TRIGGER_OPTIONS: { value: string; label: string }[] = [
  { value: "FormSubmitted", label: "Form submitted" },
  { value: "PersonCreated", label: "Person created" },
  { value: "EventRegistered", label: "Event registration received" },
];

export function triggerLabel(trigger: string): string {
  return TRIGGER_OPTIONS.find((o) => o.value === trigger)?.label ?? trigger;
}

export const CONDITION_OP_OPTIONS: { value: string; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
];

export const STEP_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "SEND_EMAIL", label: "Send email" },
  { value: "ADD_TO_GROUP", label: "Add person to group" },
  { value: "ADD_TAG", label: "Tag person" },
  { value: "CREATE_TASK", label: "Create task" },
  { value: "ENROLL_IN_JOURNEY", label: "Enroll in journey" },
  { value: "WAIT", label: "Wait" },
];

export function stepTypeLabel(type: string): string {
  return STEP_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export function workflowStatusTone(status: string): BadgeTone {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "PAUSED":
      return "warning";
    case "DRAFT":
    default:
      return "neutral";
  }
}

export function workflowStatusLabel(status: string): string {
  return { PUBLISHED: "Active", PAUSED: "Paused", DRAFT: "Draft" }[status] ?? status;
}

export function runStatusTone(status: string): BadgeTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "danger";
    case "WAITING":
      return "info";
    case "CANCELLED":
      return "warning";
    case "PENDING":
    case "RUNNING":
    default:
      return "neutral";
  }
}

export function runStatusLabel(status: string): string {
  return (
    { PENDING: "Pending", RUNNING: "Running", WAITING: "Waiting", COMPLETED: "Completed", FAILED: "Failed", CANCELLED: "Cancelled" }[
      status
    ] ?? status
  );
}
