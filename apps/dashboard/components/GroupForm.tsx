import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import { GROUP_ENROLLMENT_OPTIONS, GROUP_TYPE_OPTIONS } from "../lib/groups-format";

interface GroupFormValues {
  name?: string;
  type?: string;
  description?: string | null;
  enrollment?: string;
  meetingSchedule?: string | null;
  meetingLocation?: string | null;
  capacity?: number | null;
  isPublished?: boolean;
  campusId?: string | null;
}

/**
 * Shared create/edit form for a Group. Plain server-rendered <form> bound to a server
 * action -- used by both /groups/new and the group detail page.
 */
export function GroupForm({
  action,
  group,
  campuses,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  group?: GroupFormValues;
  campuses: { id: string; name: string }[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Name <span className="text-danger">*</span>
        <Input name="name" required defaultValue={group?.name ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Type
        <Select name="type" defaultValue={group?.type ?? "SMALL_GROUP"} className="mt-1">
          {GROUP_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm text-ink-secondary">
        Enrollment
        <Select name="enrollment" defaultValue={group?.enrollment ?? "OPEN"} className="mt-1">
          {GROUP_ENROLLMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm text-ink-secondary">
        Meeting schedule
        <Input
          name="meetingSchedule"
          defaultValue={group?.meetingSchedule ?? ""}
          placeholder="Tuesdays, 7:00 PM"
          className="mt-1"
        />
      </label>
      <label className="text-sm text-ink-secondary">
        Meeting location
        <Input name="meetingLocation" defaultValue={group?.meetingLocation ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Capacity <span className="text-ink-muted">(blank = unlimited)</span>
        <Input name="capacity" type="number" min={1} defaultValue={group?.capacity ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Home campus
        <Select name="campusId" defaultValue={group?.campusId ?? ""} className="mt-1">
          <option value="">No campus</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Description
        <Textarea name="description" rows={3} defaultValue={group?.description ?? ""} className="mt-1" />
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-secondary sm:col-span-2">
        <input
          type="checkbox"
          name="isPublished"
          defaultChecked={group?.isPublished ?? false}
          className="h-4 w-4 rounded border-border-strong text-accent focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        Publish to the group finder
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={buttonClasses("primary", "md")}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
