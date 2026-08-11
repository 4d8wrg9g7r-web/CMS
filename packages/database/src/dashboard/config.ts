/**
 * Pure dashboard-layout model (docs/domain/reports.md). A layout arrives from the
 * client as untrusted JSON and is stored verbatim per user per org —
 * validateDashboardConfig is the single gate. Layout is presentation only: hiding
 * a section or ordering cards never changes what the viewer is allowed to see
 * (permission checks stay where the data is fetched).
 */

/** The Overview's hideable sections, in their fixed render order. */
export const DASHBOARD_SECTIONS = [
  "metrics",
  "pinnedFilters",
  "pinnedReports",
  "upcomingEvents",
  "recentActivity",
] as const;

export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

export interface DashboardConfig {
  /** SavedReport ids in display order; pinned reports not listed append at the end. */
  reportOrder: string[];
  hiddenSections: DashboardSection[];
}

export const EMPTY_DASHBOARD_CONFIG: DashboardConfig = { reportOrder: [], hiddenSections: [] };

const MAX_REPORT_ORDER = 100;

/**
 * Coerce unknown input to a safe config: unknown sections and non-string ids are
 * dropped (never rejected — a stale layout should degrade, not error), both lists
 * are deduped, and the order list is bounded.
 */
export function validateDashboardConfig(input: unknown): DashboardConfig {
  if (!input || typeof input !== "object") return EMPTY_DASHBOARD_CONFIG;
  const raw = input as { reportOrder?: unknown; hiddenSections?: unknown };

  const reportOrder = Array.isArray(raw.reportOrder)
    ? [...new Set(raw.reportOrder.filter((id): id is string => typeof id === "string" && id.trim().length > 0))].slice(
        0,
        MAX_REPORT_ORDER,
      )
    : [];

  const hiddenSections = Array.isArray(raw.hiddenSections)
    ? [
        ...new Set(
          raw.hiddenSections.filter((s): s is DashboardSection =>
            (DASHBOARD_SECTIONS as readonly string[]).includes(s as string),
          ),
        ),
      ]
    : [];

  return { reportOrder, hiddenSections };
}

/** Order items by the saved id order; unknown ids keep their relative position at the end. */
export function applyReportOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const position = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const pa = position.get(a.id) ?? order.length;
    const pb = position.get(b.id) ?? order.length;
    return pa === pb ? 0 : pa - pb;
  });
}
