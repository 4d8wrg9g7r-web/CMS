import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Cake, ChevronRight, Contact, Lightbulb } from "lucide-react";
import {
  applyReportOrder,
  dashboardService,
  homeService,
  peopleService,
  reportingService,
  auditService,
  type MembershipStatus,
  formatTimeShort,
  DEFAULT_TIMEZONE,
} from "@cms/database";
import { runReportAction } from "../reports/actions";
import { PinnedReportCard } from "../../../components/PinnedReportCard";
import { DashboardCustomizer, type CustomizerSection } from "../../../components/DashboardCustomizer";
import type { ChartSeries } from "../../../components/report-charts";
import { canPeople } from "../../../lib/people-access";
import { canGiving } from "../../../lib/giving-access";
import { MetricCard } from "../../../components/ui/MetricCard";
import { Card } from "../../../components/ui/Card";
import { auditActionLabel, greetingForHour, timeAgo } from "../../../lib/format";
import { hourInTimeZone } from "../../../lib/org-time";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";

/**
 * Home (docs/design-system.md "Home"): a morning briefing, not an analytics
 * dump. Needs-attention first, then the week ahead, then the pulse, then
 * rules-driven insights — every line actionable, every number deterministic.
 * The customizable pinned cards the church set up live below the brief.
 */

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Delta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-xs font-medium text-ink-muted">— flat</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-success" : "text-danger"}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(pct)}%
    </span>
  );
}

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default async function HomePage() {
  const organization = await getCurrentOrganization();
  const timeZone = organization?.timezone ?? DEFAULT_TIMEZONE;
  const user = await getCurrentUser();
  if (!organization) return null;

  const [brief, givingOk, peopleOk, pinnedReports, pinnedFilters, activity, layout] = await Promise.all([
    homeService.getHomeBrief(organization.id),
    canGiving(organization.id, "giving.view"),
    canPeople(organization.id, "person.view"),
    reportingService.listPinnedReports(organization.id),
    peopleService.listPinnedPersonFilters(organization.id),
    auditService.listAuditEvents(organization.id, 8),
    user ? dashboardService.getDashboardConfig(organization.id, user.id) : null,
  ]);
  const config = layout ?? { reportOrder: [], hiddenSections: [] };

  // Role-aware: a viewer without giving.view never sees money on Home.
  const pulse = brief.pulse.filter((m) => m.key !== "giving" || givingOk);

  // Pinned reports re-run live for THIS viewer — runReportAction re-checks source
  // and person permissions per run, so a card the viewer can't see simply drops out.
  const pinnedCharts = (
    await Promise.all(
      pinnedReports.map(async (report) => {
        const run = await runReportAction({ config: report.config });
        if (!run.ok || !run.groups) return null;
        const series: ChartSeries[] = [
          { label: run.primaryLabel ?? report.name, groups: run.groups },
          ...(run.comparisons ?? []).map((c) => ({ label: c.label, groups: c.groups })),
        ];
        const totals = [run.total ?? 0, ...(run.comparisons ?? []).map((c) => c.total)];
        const chart = ((report.config as { chart?: string }).chart as string | undefined) ?? "table";
        return { id: report.id, name: report.name, chart, measure: run.measure ?? "count", series, totals };
      }),
    )
  ).filter((c): c is NonNullable<typeof c> => c !== null);

  const filterCards = peopleOk
    ? await Promise.all(
        pinnedFilters.map(async (filter) => {
          const fc = filter.config as { q?: string | null; status?: string | null; campusId?: string | null };
          const count = await peopleService.countPeople(organization.id, {
            search: fc.q ?? undefined,
            status: (fc.status as MembershipStatus | null) ?? undefined,
            campusId: fc.campusId ?? undefined,
          });
          const sp = new URLSearchParams();
          if (fc.q) sp.set("q", fc.q);
          if (fc.status) sp.set("status", fc.status);
          if (fc.campusId) sp.set("campus", fc.campusId);
          return { id: filter.id, name: filter.name, count, href: `/people?${sp.toString()}` };
        }),
      )
    : [];

  const firstName = (user?.name || user?.email || "there").split(" ")[0]?.split("@")[0];
  const orderedCharts = applyReportOrder(pinnedCharts, config.reportOrder);

  const sectionsBefore: CustomizerSection[] =
    filterCards.length > 0
      ? [
          {
            key: "pinnedFilters",
            label: "Pinned filters",
            node: (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {filterCards.map((card) => (
                  <Link key={card.id} href={card.href} className="block">
                    <MetricCard label={card.name} value={card.count} helperText="Pinned filter · live count" icon={<Contact size={16} />} />
                  </Link>
                ))}
              </div>
            ),
          },
        ]
      : [];

  const reportCards = orderedCharts.map((card) => ({
    id: card.id,
    name: card.name,
    node: (
      <Card>
        <PinnedReportCard name={card.name} chart={card.chart} measure={card.measure} series={card.series} totals={card.totals} />
      </Card>
    ),
  }));

  const activityNode = (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
        <Link href="/audit-log" className="rounded-sm text-xs font-medium text-accent hover:text-accent-dark">
          View all
        </Link>
      </div>
      {activity.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {activity.map((event) => (
            <li key={event.id} className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted/50" />
              <p className="min-w-0 flex-1 truncate text-sm text-ink">{auditActionLabel(event.action)}</p>
              <span className="shrink-0 text-xs text-ink-muted">{timeAgo(event.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-10 pt-2">
        <h1 className="text-display text-[34px] leading-tight text-ink">
          {greetingForHour(hourInTimeZone(new Date(), timeZone))}, {firstName}.
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-secondary">Here&rsquo;s what&rsquo;s happening at {organization.name}.</p>
      </div>

      {brief.attention.length > 0 && (
        <Card padding="none" className="mb-10" data-section="needs-attention">
          <h2 className="px-6 pb-1 pt-5 text-sm font-semibold text-ink">Needs your attention</h2>
          <ul className="divide-y divide-border">
            {brief.attention.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-4 px-6 py-3.5 transition-colors duration-180 hover:bg-surface-muted"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{item.text}</span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent">
                    {item.actionLabel}
                    <ChevronRight size={15} className="transition-transform duration-180 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mb-10" data-section="this-week">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-ink">This week</h2>
          <Link href="/events" className="text-sm font-medium text-accent hover:text-accent-dark">
            View calendar →
          </Link>
        </div>
        {brief.week.length === 0 && brief.birthdayCount === 0 ? (
          <Card padding="md">
            <p className="text-center text-sm text-ink-muted">
              Nothing scheduled in the next seven days.{" "}
              <Link href="/events/new" className="font-medium text-accent">
                Plan something →
              </Link>
            </p>
          </Card>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {brief.week.map((item) => (
                <li key={`${item.id}:${item.when.toISOString()}`}>
                  <Link
                    href={`/events/${item.id}`}
                    className="flex items-center gap-5 px-6 py-4 transition-colors duration-180 hover:bg-surface-muted"
                  >
                    <div className="w-11 shrink-0 text-center">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-accent">{WEEKDAY[item.when.getDay()]}</p>
                      <p className="text-metric text-xl text-ink">{item.when.getDate()}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">{item.title}</p>
                      <p className="truncate text-sm text-ink-muted">
                        {formatTimeShort(item.when, timeZone)}
                        {item.location ? ` · ${item.location}` : ""}
                      </p>
                    </div>
                    {item.registered > 0 && (
                      <span className="shrink-0 text-sm text-ink-secondary">
                        {item.registered}
                        {item.capacity ? ` / ${item.capacity}` : ""} registered
                      </span>
                    )}
                  </Link>
                </li>
              ))}
              {brief.birthdayCount > 0 && (
                <li className="flex items-center gap-5 px-6 py-4">
                  <span className="flex w-11 shrink-0 justify-center text-accent">
                    <Cake size={20} />
                  </span>
                  <p className="text-[15px] text-ink">
                    {brief.birthdayCount} {brief.birthdayCount === 1 ? "person has" : "people have"} a birthday this week
                  </p>
                </li>
              )}
            </ul>
          </Card>
        )}
      </section>

      <section className="mb-10" data-section="church-pulse">
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-ink">Church pulse</h2>
        <div className={`grid grid-cols-2 gap-4 ${pulse.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {pulse.map((metric) => (
            <Card key={metric.key} padding="md">
              <p className="text-[13px] font-medium text-ink-secondary">{metric.label}</p>
              <p className="text-metric mt-2 text-[34px] leading-none text-ink">
                {metric.format === "currency" ? money(metric.current) : metric.current.toLocaleString()}
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <Delta current={metric.current} previous={metric.previous} />
                <span className="text-xs text-ink-muted">{metric.helper}</span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {brief.insights.length > 0 && (
        <section className="mb-10" data-section="insights">
          <h2 className="mb-4 text-xl font-semibold tracking-tight text-ink">Insights</h2>
          <Card padding="none">
            <ul className="divide-y divide-border">
              {brief.insights.map((insight) => (
                <li key={insight.key}>
                  <Link
                    href={insight.href}
                    className="group flex items-center gap-4 px-6 py-3.5 transition-colors duration-180 hover:bg-surface-muted"
                  >
                    <Lightbulb size={15} className="shrink-0 text-ink-muted" aria-hidden />
                    <span className="min-w-0 flex-1 text-[15px] text-ink">{insight.text}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent">
                      {insight.actionLabel}
                      <ChevronRight size={15} className="transition-transform duration-180 group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <DashboardCustomizer
        initialConfig={config}
        sectionsBefore={sectionsBefore}
        sectionsAfter={[{ key: "recentActivity", label: "Recent activity", node: activityNode }]}
        reportCards={reportCards}
        hasPinnedReports={reportCards.length > 0}
      />
    </div>
  );
}
