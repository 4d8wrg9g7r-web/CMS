import { ActionForm, FieldError } from "./ui/ActionForm";
import { SubmitButton } from "./ui/SubmitButton";
import { Input, Select, Textarea } from "./ui/Input";
import { RECURRENCE_OPTIONS } from "../lib/events-format";
import type { ActionResult } from "../lib/action-result";

interface EventFormValues {
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: Date;
  endAt?: Date | null;
  allDay?: boolean;
  recurrence?: string;
  recurrenceInterval?: number;
  recurrenceUntil?: Date | null;
  capacity?: number | null;
  campusId?: string | null;
  calendarId?: string | null;
  allowAppCheckIn?: boolean;
}

function toLocalInput(date: Date | null | undefined): string {
  if (!date) return "";
  // datetime-local wants "YYYY-MM-DDTHH:mm" without timezone; render the stored UTC
  // instant's ISO prefix (server-locale display is a documented platform follow-up).
  return new Date(date).toISOString().slice(0, 16);
}

/**
 * Shared create/edit form for an Event. Server-rendered <form> bound to a server action,
 * same pattern as PersonForm/GroupForm.
 */
export function EventForm({
  action,
  event,
  campuses,
  calendars = [],
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  event?: EventFormValues;
  campuses: { id: string; name: string }[];
  calendars?: { id: string; name: string }[];
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Title <span className="text-danger">*</span>
        <Input name="title" defaultValue={event?.title ?? ""} className="mt-1" />
        <FieldError name="title" />
      </label>
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Description
        <Textarea name="description" rows={3} defaultValue={event?.description ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Starts <span className="text-danger">*</span>
        <Input name="startAt" type="datetime-local" defaultValue={toLocalInput(event?.startAt)} className="mt-1" />
        <FieldError name="startAt" />
      </label>
      <label className="text-sm text-ink-secondary">
        Ends
        <Input name="endAt" type="datetime-local" defaultValue={toLocalInput(event?.endAt)} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Location
        <Input name="location" defaultValue={event?.location ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Campus
        <Select name="campusId" defaultValue={event?.campusId ?? ""} className="mt-1">
          <option value="">No campus</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm text-ink-secondary">
        Calendar
        <Select name="calendarId" defaultValue={event?.calendarId ?? ""} className="mt-1">
          <option value="">General</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm text-ink-secondary">
        Repeats
        <Select name="recurrence" defaultValue={event?.recurrence ?? "NONE"} className="mt-1">
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm text-ink-secondary">
        Every N days/weeks/months
        <Input
          name="recurrenceInterval"
          type="number"
          min={1}
          defaultValue={event?.recurrenceInterval ?? 1}
          className="mt-1"
        />
      </label>
      <label className="text-sm text-ink-secondary">
        Repeats until <span className="text-ink-muted">(blank = no end)</span>
        <Input
          name="recurrenceUntil"
          type="date"
          defaultValue={event?.recurrenceUntil ? new Date(event.recurrenceUntil).toISOString().slice(0, 10) : ""}
          className="mt-1"
        />
      </label>
      <label className="text-sm text-ink-secondary">
        Capacity <span className="text-ink-muted">(blank = unlimited)</span>
        <Input name="capacity" type="number" min={1} defaultValue={event?.capacity ?? ""} className="mt-1" />
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-secondary sm:col-span-2">
        <input
          type="checkbox"
          name="allDay"
          defaultChecked={event?.allDay ?? false}
          className="h-4 w-4 rounded border-border-strong text-accent"
        />
        All-day event
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-secondary sm:col-span-2">
        <input
          type="checkbox"
          name="allowAppCheckIn"
          defaultChecked={event?.allowAppCheckIn ?? false}
          className="h-4 w-4 rounded border-border-strong text-accent"
        />
        <span>
          Allow check-in from the app{" "}
          <span className="text-ink-muted">(members can check in starting an hour before)</span>
        </span>
      </label>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
