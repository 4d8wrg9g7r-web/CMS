import Link from "next/link";
import {
  CalendarDays,
  CheckSquare,
  Contact,
  HelpCircle,
  PlusCircle,
  Sparkles,
  Users2,
} from "lucide-react";
import { auditService, eventService, groupService, peopleService, taskService, nextOccurrence } from "@cms/database";
import { MetricCard } from "../../../components/ui/MetricCard";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { auditActionLabel, greetingForHour, timeAgo } from "../../../lib/format";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  "organization.created": <Sparkles size={14} />,
  "person.created": <Contact size={14} />,
  "group.created": <Users2 size={14} />,
  "event.created": <CalendarDays size={14} />,
  "task.created": <CheckSquare size={14} />,
};

export default async function OverviewPage() {
  const organization = await getCurrentOrganization();
  const user = await getCurrentUser();
  if (!organization) return null;

  const [peopleCount, groupCount, events, openTaskCount, activity] = await Promise.all([
    peopleService.countPeople(organization.id),
    groupService.countGroups(organization.id),
    eventService.listEvents(organization.id),
    taskService.countTasks(organization.id),
    auditService.listAuditEvents(organization.id, 8),
  ]);

  const now = new Date();
  const upcoming = events
    .map((event) => ({ event, next: nextOccurrence(event, now) }))
    .filter((e): e is { event: (typeof events)[number]; next: Date } => e.next !== null)
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, 5);
  const firstName = (user?.name || user?.email || "there").split(" ")[0]?.split("@")[0];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {greetingForHour(new Date().getHours())}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">Here&rsquo;s what&rsquo;s happening at {organization.name}.</p>
        </div>
        <Link href="/people/new" className={buttonClasses("primary", "md")}>
          <PlusCircle size={16} /> Add Person
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="People" value={peopleCount} helperText="Active profiles" icon={<Contact size={16} />} />
        <MetricCard label="Groups" value={groupCount} helperText="Active groups" icon={<Users2 size={16} />} />
        <MetricCard
          label="Upcoming Events"
          value={upcoming.length}
          helperText={upcoming[0] ? `Next: ${upcoming[0].event.title}` : "Nothing scheduled"}
          icon={<CalendarDays size={16} />}
        />
        <MetricCard label="Open Tasks" value={openTaskCount} helperText="Open or in progress" icon={<CheckSquare size={16} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Upcoming Events</h2>
            <Link
              href="/events"
              className="rounded-sm text-xs font-medium text-accent hover:text-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              View all
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState description="No upcoming events. Create one to get started." />
          ) : (
            <ul className="flex flex-col gap-4">
              {upcoming.map(({ event, next }) => (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.id}`}
                    className="flex items-center gap-3 rounded-md p-1.5 transition-colors duration-180 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-warm text-accent-dark">
                      <CalendarDays size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{event.title}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {next.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        {event.location && ` · ${event.location}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {event._count.registrations} registered
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
            <Link
              href="/audit-log"
              className="rounded-sm text-xs font-medium text-accent hover:text-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              View all
            </Link>
          </div>
          {activity.length === 0 ? (
            <EmptyState description="No activity yet." />
          ) : (
            <ul className="flex flex-col gap-4">
              {activity.map((event) => (
                <li key={event.id} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-warm text-accent-dark">
                    {ACTIVITY_ICONS[event.action] ?? <HelpCircle size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{auditActionLabel(event.action)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted">{timeAgo(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
