import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, CalendarClock, ExternalLink, Eye, EyeOff, Trash2, Undo2, UserCheck, X } from "lucide-react";
import { eventService, expandOccurrences, personDisplayName } from "@cms/database";
import { campusService } from "@cms/database";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { EventForm } from "../../../../components/EventForm";
import { formatEventDate, recurrenceLabel } from "../../../../lib/events-format";
import { canEvents, requireEvents } from "../../../../lib/events-access";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  archiveEventAction,
  cancelRegistrationAction,
  restoreEventAction,
  setEventPublishedAction,
  updateEventAction,
} from "../actions";

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireEvents(organization.id, "event.view");
  const [canManage, canViewRegistrations] = await Promise.all([
    canEvents(organization.id, "event.manage"),
    canEvents(organization.id, "event.registrations.view"),
  ]);

  const { eventId } = await params;
  const event = await eventService.getEvent(organization.id, eventId);
  if (!event) notFound();

  const [campuses, registrations] = await Promise.all([
    campusService.listCampuses(organization.id),
    canViewRegistrations ? eventService.listRegistrations(organization.id, eventId) : Promise.resolve([]),
  ]);

  const now = new Date();
  const upcoming = expandOccurrences(event, now, new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), 6);

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const publicUrl = `${proto}://${host}/e/${event.publicId}`;

  return (
    <div>
      <Link href="/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Events
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{event.title}</h1>
        <Badge variant="info">{recurrenceLabel(event.recurrence, event.recurrenceInterval)}</Badge>
        {event.isPublished ? <Badge variant="success">Published</Badge> : <Badge>Draft</Badge>}
        {event.archivedAt && <Badge variant="warning">Archived</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {canManage && (
            <Card padding="md">
              <h2 className="mb-4 text-sm font-semibold text-ink">Details</h2>
              <EventForm
                action={updateEventAction.bind(null, event.id)}
                event={event}
                campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
                submitLabel="Save changes"
              />
            </Card>
          )}

          {canViewRegistrations && (
            <Card padding="md">
              <h2 className="mb-4 text-sm font-semibold text-ink">
                Registrations ({event._count.registrations}
                {event.capacity ? ` / ${event.capacity}` : ""})
              </h2>
              {registrations.length === 0 ? (
                <p className="text-sm text-ink-muted">No registrations yet. Share the public link to collect them.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {registrations.map((registration) => (
                    <li key={registration.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div>
                        {registration.person ? (
                          <Link href={`/people/${registration.person.id}`} className="font-medium text-ink hover:text-accent">
                            {personDisplayName(registration.person)}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{registration.name}</span>
                        )}
                        <span className="block text-xs text-ink-muted">
                          {registration.email ?? "no email"} · {new Date(registration.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {registration.status === "CANCELLED" ? (
                          <Badge variant="warning">Cancelled</Badge>
                        ) : (
                          <>
                            <Badge variant="success">Registered</Badge>
                            <form action={cancelRegistrationAction.bind(null, event.id, registration.id)}>
                              <button
                                type="submit"
                                aria-label="Cancel registration"
                                className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                              >
                                <X size={14} />
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {canViewRegistrations && (
            <Link href={`/events/${event.id}/checkin`} className={buttonClasses("secondary", "md") + " w-full"}>
              <UserCheck size={16} /> Open check-in
            </Link>
          )}

          <Card padding="md">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <CalendarClock size={15} /> Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-muted">No upcoming occurrences in the next 90 days.</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-ink-secondary">
                {upcoming.map((occurrence) => (
                  <li key={occurrence.toISOString()}>{formatEventDate(occurrence, event.allDay)}</li>
                ))}
              </ul>
            )}
          </Card>

          {canManage && (
            <Card padding="md">
              <h2 className="mb-3 text-sm font-semibold text-ink">Publish</h2>
              {event.isPublished ? (
                <>
                  <p className="mb-2 text-xs text-ink-muted">Live. Share the public page:</p>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-3 flex items-center gap-1.5 break-all rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-accent hover:underline"
                  >
                    <ExternalLink size={13} className="shrink-0" /> {publicUrl}
                  </a>
                  <form action={setEventPublishedAction.bind(null, event.id, false)}>
                    <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                      <EyeOff size={14} /> Unpublish
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="mb-3 text-xs text-ink-muted">
                    Publishing makes this event live at a public link with registration.
                  </p>
                  <form action={setEventPublishedAction.bind(null, event.id, true)}>
                    <button type="submit" className={buttonClasses("primary", "sm") + " w-full"}>
                      <Eye size={14} /> Publish event
                    </button>
                  </form>
                </>
              )}
            </Card>
          )}

          {canManage && (
            <Card padding="md">
              <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
              {event.archivedAt ? (
                <form action={restoreEventAction.bind(null, event.id)}>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    <Undo2 size={14} /> Restore event
                  </button>
                </form>
              ) : (
                <form action={archiveEventAction.bind(null, event.id)}>
                  <button type="submit" className={buttonClasses("danger", "sm") + " w-full"}>
                    <Trash2 size={14} /> Archive event
                  </button>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
