import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LogOut, UserCheck, X } from "lucide-react";
import { checkinService, eventService, expandOccurrences, peopleService, personDisplayName } from "@cms/database";
import { Badge } from "../../../../../components/ui/Badge";
import { buttonClasses } from "../../../../../components/ui/Button";
import { Card } from "../../../../../components/ui/Card";
import { Select } from "../../../../../components/ui/Input";
import { formatEventDate } from "../../../../../lib/events-format";
import { requireCheckin } from "../../../../../lib/checkin-access";
import { getCurrentOrganization } from "../../../../../lib/session";
import { checkInAction, checkOutAction, undoCheckInAction } from "./actions";

/**
 * Occurrence roster: registered people first (one-tap check-in), then anyone by select.
 * The occurrence is identified by its start instant (?occ=ISO) per the documented
 * recurrence strategy. Adult/general attendance only (docs/domain/checkin.md).
 */
export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ occ?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireCheckin(organization.id, "checkin.view");
  // Roster actions are manage-gated in the actions; the page itself is view+.

  const { eventId } = await params;
  const event = await eventService.getEvent(organization.id, eventId);
  if (!event) notFound();

  // Occurrence choices: recent past (checking in latecomers after the fact) + near future.
  const now = new Date();
  const windowStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const occurrenceChoices = expandOccurrences(event, windowStart, windowEnd, 12);

  const sp = await searchParams;
  const requested = sp.occ ? new Date(sp.occ) : null;
  const occurrence =
    requested && !Number.isNaN(requested.getTime())
      ? requested
      : (occurrenceChoices.find((o) => o >= now) ?? occurrenceChoices[occurrenceChoices.length - 1] ?? event.startAt);
  const occurrenceIso = occurrence.toISOString();

  const [checkIns, registrations, allPeople] = await Promise.all([
    checkinService.listForOccurrence(organization.id, eventId, occurrence),
    eventService.listRegistrations(organization.id, eventId),
    peopleService.listPeople(organization.id, { take: 200 }),
  ]);
  const checkedInIds = new Set(checkIns.map((c) => c.personId));
  const registrants = registrations.filter((r) => r.status === "REGISTERED" && r.personId && !checkedInIds.has(r.personId));
  const walkIns = allPeople.filter((p) => !checkedInIds.has(p.id) && !registrants.some((r) => r.personId === p.id));

  const boundCheckIn = checkInAction.bind(null, eventId, occurrenceIso);

  return (
    <div>
      <Link
        href={`/events/${eventId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to {event.title}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-display text-[28px] leading-tight text-ink">Check-in</h1>
        <Badge variant="info">{formatEventDate(occurrence, event.allDay)}</Badge>
        <Badge variant="success">{checkIns.length} checked in</Badge>
      </div>

      {occurrenceChoices.length > 1 && (
        <Card padding="sm" className="mb-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-ink-secondary">
              Occurrence
              <Select name="occ" defaultValue={occurrenceIso} className="mt-1 w-72">
                {occurrenceChoices.map((o) => (
                  <option key={o.toISOString()} value={o.toISOString()}>
                    {formatEventDate(o, event.allDay)}
                  </option>
                ))}
              </Select>
            </label>
            <button type="submit" className={buttonClasses("secondary", "md")}>
              Switch
            </button>
          </form>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="md">
          <h2 className="mb-4 text-sm font-semibold text-ink">Checked in ({checkIns.length})</h2>
          {checkIns.length === 0 ? (
            <p className="text-sm text-ink-muted">No one yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {checkIns.map((checkIn) => (
                <li key={checkIn.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <Link href={`/people/${checkIn.personId}`} className="font-medium text-ink hover:text-accent">
                      {personDisplayName(checkIn.person)}
                    </Link>
                    <span className="block text-xs text-ink-muted">
                      In {new Date(checkIn.checkedInAt).toLocaleTimeString()}
                      {checkIn.checkedOutAt && ` · out ${new Date(checkIn.checkedOutAt).toLocaleTimeString()}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!checkIn.checkedOutAt && (
                      <form action={checkOutAction.bind(null, eventId, occurrenceIso, checkIn.id)}>
                        <button type="submit" className={buttonClasses("ghost", "sm")} title="Check out">
                          <LogOut size={13} /> Out
                        </button>
                      </form>
                    )}
                    <form action={undoCheckInAction.bind(null, eventId, occurrenceIso, checkIn.id)}>
                      <button
                        type="submit"
                        aria-label="Undo check-in"
                        title="Undo (mistake)"
                        className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                      >
                        <X size={14} />
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card padding="md">
            <h2 className="mb-4 text-sm font-semibold text-ink">Registered ({registrants.length})</h2>
            {registrants.length === 0 ? (
              <p className="text-sm text-ink-muted">Every registrant is checked in.</p>
            ) : (
              <ul className="divide-y divide-border">
                {registrants.map((registration) => (
                  <li key={registration.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="text-ink">{registration.person ? personDisplayName(registration.person) : registration.name}</span>
                    <form action={boundCheckIn}>
                      <input type="hidden" name="personId" value={registration.personId ?? ""} />
                      <button type="submit" className={buttonClasses("secondary", "sm")}>
                        <UserCheck size={14} /> Check in
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="md">
            <h2 className="mb-3 text-sm font-semibold text-ink">Walk-in</h2>
            <form action={boundCheckIn} className="flex flex-wrap items-end gap-2">
              <Select name="personId" defaultValue="" required className="w-60 text-sm">
                <option value="" disabled>
                  Choose a person…
                </option>
                {walkIns.map((person) => (
                  <option key={person.id} value={person.id}>
                    {personDisplayName(person)}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                <UserCheck size={14} /> Check in
              </button>
            </form>
            <p className="mt-2 text-xs text-ink-muted">
              Someone new? <Link href="/people/new" className="text-accent hover:underline">Add them to People</Link> first.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
