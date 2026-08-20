import Link from "next/link";
import { BarChart3, CalendarCheck, Lock, Users } from "lucide-react";
import {
  campusService,
  checkinService,
  countUniquePeople,
  eventService,
  summarizeByEvent,
  weeklyBuckets,
  kioskService,
  formatInTimeZone,
  DEFAULT_TIMEZONE,
} from "@cms/database";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Select } from "../../../components/ui/Input";
import { MetricCard } from "../../../components/ui/MetricCard";
import { canCheckin } from "../../../lib/checkin-access";
import { KioskManagerCard } from "../../../components/KioskManagerCard";
import { getCurrentOrganization } from "../../../lib/session";

const RANGES = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 365 days" },
] as const;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; campus?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const timeZone = organization?.timezone ?? DEFAULT_TIMEZONE;
  if (!organization) return null;

  // Aggregates-only surface: attendance.view (which ANALYTICS_VIEWER holds) is enough
  // here because nothing on this page names a person. Rosters stay behind checkin.view.
  const allowed = await canCheckin(organization.id, "attendance.view");
  if (!allowed) {
    return (
      <div>
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Check-ins and Attendance</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to attendance reporting"
            description="Attendance reports are available to owners, admins, and analytics viewers."
          />
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const days = RANGES.find((r) => r.days === Number.parseInt(params.range ?? "", 10))?.days ?? 90;
  const campusId = params.campus || undefined;

  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [campuses, rows, events] = await Promise.all([
    campusService.listCampuses(organization.id),
    checkinService.listAttendanceRows(organization.id, { from, to: now, campusId }),
    eventService.listEvents(organization.id, { includeArchived: true }),
  ]);

  const [kiosks, kioskCalendars, canManageKiosks, appGeo] = await Promise.all([
    kioskService.listKiosks(organization.id),
    eventService.listCalendars(organization.id),
    canCheckin(organization.id, "checkin.manage"),
    kioskService.appCheckInGeoSummary(organization.id, { days }),
  ]);

  const eventTitles = new Map(events.map((e) => [e.id, e.title]));
  const weeks = Math.min(Math.ceil(days / 7), 52);
  const buckets = weeklyBuckets(rows, weeks, now);
  const summaries = summarizeByEvent(rows);
  const uniquePeople = countUniquePeople(rows);
  const occurrenceTotal = summaries.reduce((sum, s) => sum + s.occurrenceCount, 0);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Check-ins and Attendance</h1>
        <p className="text-sm text-ink-secondary">
          Head-counts and trends from event check-ins. Rosters live on each event&rsquo;s check-in page.
        </p>
      </div>

      <Card padding="sm" className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-secondary">
            Range
            <Select name="range" defaultValue={String(days)} className="mt-1 w-44">
              {RANGES.map((r) => (
                <option key={r.days} value={r.days}>
                  {r.label}
                </option>
              ))}
            </Select>
          </label>
          {campuses.length > 0 && (
            <label className="text-sm text-ink-secondary">
              Campus
              <Select name="campus" defaultValue={campusId ?? ""} className="mt-1 w-44">
                <option value="">All campuses</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <button type="submit" className={buttonClasses("secondary", "md")}>
            Apply
          </button>
        </form>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Check-ins" value={rows.length} helperText={`Last ${days} days`} icon={<CalendarCheck size={16} />} />
        <MetricCard label="Unique People" value={uniquePeople} helperText="Guests not included" icon={<Users size={16} />} />
        <MetricCard label="Occurrences" value={occurrenceTotal} helperText={`Across ${summaries.length} event${summaries.length === 1 ? "" : "s"}`} icon={<BarChart3 size={16} />} />
        <MetricCard
          label="Avg per Occurrence"
          value={occurrenceTotal > 0 ? Math.round((rows.length / occurrenceTotal) * 10) / 10 : 0}
          helperText="All events combined"
          icon={<BarChart3 size={16} />}
        />
      </div>

      <Card padding="md" className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-ink">Weekly check-ins</h2>
        {rows.length === 0 ? (
          <EmptyState description="No check-ins in this range yet. Head-counts appear as people are checked in at events." />
        ) : (
          <div>
            <div className="flex h-36 items-end gap-1">
              {buckets.map((bucket) => (
                // Zero weeks render as a hairline in the border color, never as
                // a data-colored bar — an empty quarter must not read as steady
                // small attendance (UX audit #15).
                <div
                  key={bucket.weekStart.toISOString()}
                  className={`group relative flex-1 rounded-t transition-colors ${
                    bucket.count === 0 ? "bg-border" : "bg-accent/80 hover:bg-accent"
                  }`}
                  style={{ height: bucket.count === 0 ? "2px" : `${Math.max(6, Math.round((bucket.count / maxBucket) * 100))}%` }}
                  title={`Week of ${bucket.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: ${bucket.count} check-in${bucket.count === 1 ? "" : "s"}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-ink-muted">
              <span>
                {buckets[0]?.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                {" · peak "}
                {maxBucket}/wk
              </span>
              <span>
                Week of{" "}
                {buckets[buckets.length - 1]?.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card padding="none">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">By event</h2>
        </div>
        {summaries.length === 0 ? (
          <EmptyState description="No attended events in this range." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-5 py-3 font-medium">Occurrences</th>
                  <th className="px-5 py-3 font-medium">Total check-ins</th>
                  <th className="px-5 py-3 font-medium">Avg</th>
                  <th className="px-5 py-3 font-medium">Most recent</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <tr key={summary.eventId} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link href={`/events/${summary.eventId}`} className="font-medium text-ink hover:text-accent">
                        {eventTitles.get(summary.eventId) ?? "Deleted event"}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{summary.occurrenceCount}</td>
                    <td className="px-5 py-3 text-ink-secondary">{summary.total}</td>
                    <td className="px-5 py-3 text-ink-secondary">{summary.averagePerOccurrence}</td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {formatInTimeZone(summary.lastOccurrenceAt, timeZone, { month: "short", day: "numeric" })} ·{" "}
                      {summary.lastOccurrenceCount} checked in
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {appGeo.total > 0 && (
        <Card padding="md" className="mt-6" data-section="app-checkins">
          <h2 className="mb-1 text-sm font-semibold text-ink">App check-ins</h2>
          <p className="mb-3 text-xs text-ink-muted">
            Members checking in from the church app over this range.
            {appGeo.campusesWithCoordinates === 0 &&
              " Add campus coordinates in Settings to split these into on-site vs remote."}
          </p>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-2xl font-semibold text-ink">{appGeo.total}</p>
              <p className="text-xs text-ink-muted">Total</p>
            </div>
            {appGeo.campusesWithCoordinates > 0 && (
              <>
                <div>
                  <p className="text-2xl font-semibold text-ink">{appGeo.onSite}</p>
                  <p className="text-xs text-ink-muted">On-site (within 500m of a campus)</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-ink">{appGeo.remote}</p>
                  <p className="text-xs text-ink-muted">Remote</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-ink">{appGeo.total - appGeo.located}</p>
                  <p className="text-xs text-ink-muted">No location shared</p>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      <div className="mt-6">
        <KioskManagerCard
          kiosks={kiosks.map((k) => ({
            id: k.id,
            name: k.name,
            enabled: k.enabled,
            publicKioskKey: k.publicKioskKey,
            calendarName: k.calendar?.name ?? null,
          }))}
          calendars={kioskCalendars.map((c) => ({ id: c.id, name: c.name }))}
          canManage={canManageKiosks}
        />
      </div>
    </div>
  );
}
