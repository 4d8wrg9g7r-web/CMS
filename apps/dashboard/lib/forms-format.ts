import type { FormFieldType } from "@cms/database";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: "SHORT_TEXT", label: "Short text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "CHECKBOX", label: "Checkbox" },
];

export function fieldTypeLabel(type: FormFieldType): string {
  return FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export const FIELD_MAPPING_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "No mapping" },
  { value: "firstName", label: "Person · First name" },
  { value: "lastName", label: "Person · Last name" },
  { value: "email", label: "Person · Email" },
  { value: "phone", label: "Person · Phone" },
];

export function formStatusTone(status: string): BadgeTone {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "CLOSED":
      return "warning";
    case "DRAFT":
    default:
      return "neutral";
  }
}

export function formStatusLabel(status: string): string {
  return { PUBLISHED: "Published", CLOSED: "Closed", DRAFT: "Draft" }[status] ?? status;
}
