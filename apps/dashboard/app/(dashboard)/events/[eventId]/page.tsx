import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, CalendarClock, ExternalLink, Eye, EyeOff, MapPin, Trash2, Undo2, UserCheck } from "lucide-react";
import { checkinService, eventService, expandOccurrences, personDisplayName } from "@cms/database";
import { campusService } from "@cms/database";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { EventForm } from "../../../../components/EventForm";
import { EventRegistrationList } from "../../../../components/EventRegistrationList";
import { formatEventDate, recurrenceLabel } from "../../../../lib/events-format";
import { canEvents, requireEvents } from "../../../../lib/events-access";
import { canCheckin } from "../../../../lib/checkin-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { archiveEventAction, restoreEventAction, setEventPublishedAction, updateEventAction } from "../actions";

/**
 * Event detail (docs/design-system.md "Detail pages"): identity header with
 * the next occurrence and a registration stat strip, then tabs —
 * Registrations, Attendance, Settings. Check-in stays one obvious button.
 */

type Tab = "registrations" | "attendance" | "settings";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireEvents(organization.id, "event.view");
  const [canManage, canViewRegistrations, canViewAttendance] = await Promise.all([
    canEvents(organization.id, "event.manage"),
    canEvents(organization.id, "event.registrations.view"),
    canCheckin(organization.id, "attendance.view"),
  ]);

  const { eventId } = await params;
  const { tab: rawTab } = await searchParams;
  const event = await eventService.getEvent(organization.id, eventId);
  if (!event) notFound();

  const requested: Tab = (["registrations", "attendance", "settings"] as const).includes(rawTab as Tab)
    ? (rawTab as Tab)
    : "registrations";
  // Fall back to the first tab this viewer can actually see.
  const tab: Tab =
    requested === "registrations" && !canViewRegistrations
      ? canViewAttendance
        ? "attendance"
        : "settings"
      : requested === "attendance" && !canViewAttendance
        ? canViewRegistrations
          ? "registrations"
          : "settings"
        : requested === "settings" && !canManage
          ? canViewRegistrations
            ? "registrations"
            : "attendance"
          : requested;

  const [campuses, registrations, attendanceHistory] = await Promise.all([
    campusService.listCampuses(organization.id),
    canViewRegistrations ? eventService.listRegistrations(organization.id, eventId) : Promise.resolve([]),
    canViewAttendance ? checkinService.attendanceByOccurrence(organization.id, eventId) : Promise.resolve([]),
  ]);

  const now = new Date();
  const upcoming = expandOccurrences(event, now, new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), 6);
  const next = upcoming[0] ?? null;
  const activeRegistrations = registrations.filter((r) => r.status !== "CANCELLED").length;
  const fillPct = event.capacity ? Math.min(100, Math.round((event._count.registrations / event.capacity) * 100)) : null;
  const lastAttendance = attendanceHistory[0] ?? null;

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const publicUrl = `${proto}://${host}/e/${event.publicId}`;

  const tabHref = (key: Tab) => (key === "registrations" ? `/events/${event.id}` : `/events/${event.id}?tab=${key}`);
  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: "registrations", label: "Registrations", show: canViewRegistrations },
    { key: "attendance", label: "Attendance", show: canViewAttendance },
    { key: "settings", label: "Settings", show: canManage },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/events" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Events
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-display text-[28px] leading-tight text-ink">{event.title}</h1>
            {event.recurrence !== "NONE" && <Badge variant="info">{recurrenceLabel(event.recurrence, event.recurrenceInterval)}</Badge>}
            {event.isPublished ? <Badge variant="success">Published</Badge> : <Badge>Draft</Badge>}
            {event.archivedAt && <Badge variant="warning">Archived</Badge>}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={15} className="text-ink-muted" />
              {next ? formatEventDate(next, event.allDay) : "No upcoming occurrences"}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} className="text-ink-muted" /> {event.location}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {event.isPublished && (
            <a href={publicUrl} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")}>
              <ExternalLink size={14} /> Public page
            </a>
          )}
          {canViewRegistrations && (
            <Link href={`/events/${event.id}/checkin`} className={buttonClasses("primary", "sm")}>
              <UserCheck size={15} /> Open check-in
            </Link>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3" data-section="event-stats">
        <Card padding="md">
          <p className="text-[13px] font-medium text-ink-secondary">Registered</p>
          <p className="text-metric mt-1.5 text-[28px] leading-none text-ink">
            {event._count.registrations}
            {event.capacity ? <span className="text-base text-ink-muted"> / {event.capacity}</span> : null}
          </p>
          {fillPct !== null && (
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className={`h-full rounded-full ${fillPct >= 100 ? "bg-warning" : "bg-accent"}`} style={{ width: `${fillPct}%` }} />
            </div>
          )}
        </Card>
        <Card padding="md">
          <p className="text-[13px] font-medium text-ink-secondary">Last attendance</p>
          <p className="text-metric mt-1.5 text-[28px] leading-none text-ink">{lastAttendance ? lastAttendance.count : "—"}</p>
          <p className="mt-2 text-xs text-ink-muted">
            {lastAttendance ? formatEventDate(lastAttendance.occurrenceAt, event.allDay) : "No check-ins yet"}
          </p>
        </Card>
        <Card padding="md" className="col-span-2 lg:col-span-1">
          <p className="text-[13px] font-medium text-ink-secondary">Coming up</p>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Nothing in the next 90 days.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-ink-secondary">
              {upcoming.slice(0, 3).map((occurrence) => (
                <li key={occurrence.toISOString()}>{formatEventDate(occurrence, event.allDay)}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <nav className="mb-8 flex items-center gap-1 border-b border-border" aria-label="Event sections">
        {TABS.filter((t) => t.show).map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm transition-colors duration-180 ${
              tab === t.key ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-ink-secondary hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "registrations" && canViewRegistrations && (
        <Card padding="md" className="max-w-3xl" data-section="event-registrations">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            {activeRegistrations} active {activeRegistrations === 1 ? "registration" : "registrations"}
          </h2>
          {registrations.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No registrations yet.{" "}
              {event.isPublished ? "Share the public page to collect them." : "Publish the event to open registration."}
            </p>
          ) : (
            <EventRegistrationList
              eventId={event.id}
              eventTitle={event.title}
              rows={registrations.map((registration) => ({
                id: registration.id,
                personId: registration.person?.id ?? null,
                displayName: registration.person ? personDisplayName(registration.person) : registration.name,
                email: registration.email,
                status: registration.status,
                createdAt: registration.createdAt.toISOString(),
              }))}
            />
          )}
        </Card>
      )}

      {tab === "attendance" && canViewAttendance && (
        <Card padding="md" className="max-w-2xl">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <UserCheck size={15} /> Attendance by occurrence
          </h2>
          {attendanceHistory.length === 0 ? (
            <p className="text-sm text-ink-muted">No check-ins recorded yet — use Open check-in on service day.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {attendanceHistory.map((occurrence) => (
                <li key={occurrence.occurrenceAt.toISOString()} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-ink-secondary">{formatEventDate(occurrence.occurrenceAt, event.allDay)}</span>
                  <span className="text-metric text-lg text-ink">{occurrence.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "settings" && canManage && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card padding="md" className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-ink">Details</h2>
            <EventForm
              action={updateEventAction.bind(null, event.id)}
              event={event}
              campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
              submitLabel="Save changes"
            />
          </Card>

          <div className="flex flex-col gap-5">
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
                  <p className="mb-3 text-xs text-ink-muted">Publishing makes this event live at a public link with registration.</p>
                  <form action={setEventPublishedAction.bind(null, event.id, true)}>
                    <button type="submit" className={buttonClasses("primary", "sm") + " w-full"}>
                      <Eye size={14} /> Publish event
                    </button>
                  </form>
                </>
              )}
            </Card>

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
          </div>
        </div>
      )}
    </div>
  );
}
