import { buttonClasses } from "./ui/Button";
import { Input, Select, Textarea } from "./ui/Input";
import { MEMBERSHIP_STATUS_OPTIONS } from "../lib/people-format";

interface PersonFormValues {
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  membershipStatus?: string;
  birthdate?: Date | null;
  tags?: string[];
  notes?: string | null;
  campusId?: string | null;
}

/**
 * Shared create/edit form for a Person. A plain server-rendered <form> bound to a
 * server action -- no client state needed. Used by both /people/new and the person
 * detail page so the field set stays in one place.
 */
export function PersonForm({
  action,
  person,
  campuses,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  person?: PersonFormValues;
  campuses: { id: string; name: string }[];
  submitLabel: string;
}) {
  const birthdateValue = person?.birthdate ? new Date(person.birthdate).toISOString().slice(0, 10) : "";

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-ink-secondary">
        First name <span className="text-danger">*</span>
        <Input name="firstName" required defaultValue={person?.firstName ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Last name <span className="text-danger">*</span>
        <Input name="lastName" required defaultValue={person?.lastName ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Preferred name
        <Input name="preferredName" defaultValue={person?.preferredName ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Membership status
        <Select name="membershipStatus" defaultValue={person?.membershipStatus ?? "VISITOR"} className="mt-1">
          {MEMBERSHIP_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm text-ink-secondary">
        Email
        <Input name="email" type="email" defaultValue={person?.email ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Phone
        <Input name="phone" defaultValue={person?.phone ?? ""} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Birthdate
        <Input name="birthdate" type="date" defaultValue={birthdateValue} className="mt-1" />
      </label>
      <label className="text-sm text-ink-secondary">
        Home campus
        <Select name="campusId" defaultValue={person?.campusId ?? ""} className="mt-1">
          <option value="">No campus</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Tags <span className="text-ink-muted">(comma-separated)</span>
        <Input name="tags" defaultValue={(person?.tags ?? []).join(", ")} className="mt-1" placeholder="usher, choir" />
      </label>
      <label className="text-sm text-ink-secondary sm:col-span-2">
        Notes
        <Textarea name="notes" rows={3} defaultValue={person?.notes ?? ""} className="mt-1" />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={buttonClasses("primary", "md")}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
