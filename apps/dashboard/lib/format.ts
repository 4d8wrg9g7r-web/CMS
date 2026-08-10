export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "organization.created": "Organization created",
  "campus.created": "Campus added",
  "campus.archived": "Campus archived",
  "campus.restored": "Campus restored",
  "person.created": "Person added",
  "person.updated": "Person updated",
  "group.created": "Group created",
  "event.created": "Event created",
  "task.created": "Task created",
  "team.member_invited": "Teammate invited",
  "team.member_role_updated": "Teammate role changed",
  "team.member_removed": "Teammate removed",
  "account.updated": "Account details updated",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export type BadgeTone = "success" | "warning" | "danger" | "neutral";
