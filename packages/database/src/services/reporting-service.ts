import { Prisma } from "@prisma/client";
import { tenantDb } from "../client";
import { formatFieldValue } from "../people/custom-fields";
import type { ReportConfig } from "../reporting/config";
import type { ReportRow } from "../reporting/aggregate";

/**
 * Reporting service (docs/domain/reports.md): turns a validated ReportConfig into
 * slim, labeled ReportRows for the pure aggregator. Row-level data never leaves
 * this layer — the action returns aggregates only. Authorization happens in the
 * caller (per-source permission + person.view when person data is involved).
 */

/** Beyond this the range must be narrowed — aggregation stays fast and honest. */
export const REPORT_ROW_CAP = 25000;

const STATUS_LABELS: Record<string, string> = {
  VISITOR: "Visitor",
  ATTENDER: "Attender",
  MEMBER: "Member",
  INACTIVE: "Inactive",
};

interface FetchResult {
  rows: ReportRow[];
  truncated: boolean;
}

function dateRange(config: ReportConfig): { gte?: Date; lte?: Date } {
  const range: { gte?: Date; lte?: Date } = {};
  if (config.from) range.gte = new Date(`${config.from}T00:00:00Z`);
  if (config.to) range.lte = new Date(`${config.to}T23:59:59.999Z`);
  return range;
}

/** personId → display value for one custom field key, via one query. */
async function customValueMap(organizationId: string, key: string): Promise<Map<string, string>> {
  const values = await tenantDb.personFieldValue.findMany({
    where: { organizationId, field: { key } },
    include: { field: { select: { type: true } } },
  });
  return new Map(values.map((v) => [v.personId, formatFieldValue(v.field.type, v.value)]));
}

export async function fetchReportRows(organizationId: string, config: ReportConfig): Promise<FetchResult> {
  const dim = config.groupBy.kind === "dimension" ? config.groupBy.field : null;
  const customDimKey = dim?.startsWith("custom:") ? dim.slice("custom:".length) : null;
  const customFilterKey = config.filters.customFieldKey ?? null;

  const [customDim, customFilter, campuses] = await Promise.all([
    customDimKey ? customValueMap(organizationId, customDimKey) : null,
    customFilterKey ? customValueMap(organizationId, customFilterKey) : null,
    tenantDb.campus.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);
  const campusName = new Map(campuses.map((c) => [c.id, c.name]));

  // Person-level filters shared by every source (applied via relation for
  // attendance/giving, directly for people).
  const personWhere: Prisma.PersonWhereInput = {};
  if (config.filters.membershipStatus) personWhere.membershipStatus = config.filters.membershipStatus as never;
  if (config.filters.campusId) personWhere.campusId = config.filters.campusId;

  const resolvePersonDim = (
    person: { membershipStatus: string; campusId: string | null } | null,
    personId: string | null,
  ): string | null => {
    if (!dim) return null;
    if (dim === "membershipStatus") return person ? (STATUS_LABELS[person.membershipStatus] ?? person.membershipStatus) : null;
    if (dim === "campus") return person?.campusId ? (campusName.get(person.campusId) ?? null) : null;
    if (customDimKey) return personId ? (customDim?.get(personId) ?? null) : null;
    return null;
  };

  const passesCustomFilter = (personId: string | null): boolean => {
    if (!customFilterKey) return true;
    if (!personId) return false;
    const value = customFilter?.get(personId);
    return value !== undefined && value.toLowerCase() === (config.filters.customFieldValue ?? "").toLowerCase();
  };

  let rows: ReportRow[] = [];

  if (config.source === "people") {
    const people = await tenantDb.person.findMany({
      where: { organizationId, archivedAt: null, createdAt: dateRange(config), ...personWhere },
      select: { id: true, createdAt: true, membershipStatus: true, campusId: true },
      take: REPORT_ROW_CAP + 1,
    });
    rows = people
      .filter((p) => passesCustomFilter(p.id))
      .map((p) => ({
        date: p.createdAt,
        personId: p.id,
        amountCents: null,
        dim: resolvePersonDim(p, p.id),
      }));
    return { rows, truncated: people.length > REPORT_ROW_CAP };
  }

  if (config.source === "attendance") {
    const hasPersonFilter = Object.keys(personWhere).length > 0;
    const checkIns = await tenantDb.checkIn.findMany({
      where: {
        organizationId,
        occurrenceAt: dateRange(config),
        ...(config.filters.eventId ? { eventId: config.filters.eventId } : {}),
        ...(hasPersonFilter ? { person: personWhere } : {}),
      },
      select: {
        occurrenceAt: true,
        personId: true,
        person: { select: { membershipStatus: true, campusId: true } },
        event: { select: { title: true } },
      },
      take: REPORT_ROW_CAP + 1,
    });
    rows = checkIns
      .filter((c) => passesCustomFilter(c.personId))
      .map((c) => ({
        date: c.occurrenceAt,
        personId: c.personId,
        amountCents: null,
        dim: dim === "event" ? c.event.title : resolvePersonDim(c.person, c.personId),
      }));
    return { rows, truncated: checkIns.length > REPORT_ROW_CAP };
  }

  const hasPersonFilter = Object.keys(personWhere).length > 0;
  const contributions = await tenantDb.contribution.findMany({
    where: {
      organizationId,
      receivedAt: dateRange(config),
      ...(config.filters.fundId ? { fundId: config.filters.fundId } : {}),
      ...(config.filters.method ? { method: config.filters.method as never } : {}),
      ...(hasPersonFilter ? { person: personWhere } : {}),
    },
    select: {
      receivedAt: true,
      personId: true,
      amountCents: true,
      method: true,
      person: { select: { membershipStatus: true, campusId: true } },
      fund: { select: { name: true } },
    },
    take: REPORT_ROW_CAP + 1,
  });
  rows = contributions
    .filter((c) => passesCustomFilter(c.personId))
    .map((c) => ({
      date: c.receivedAt,
      personId: c.personId,
      amountCents: c.amountCents,
      dim: dim === "fund" ? c.fund.name : dim === "method" ? c.method : resolvePersonDim(c.person, c.personId),
    }));
  return { rows, truncated: contributions.length > REPORT_ROW_CAP };
}

// -- Saved reports ---------------------------------------------------------------

export async function listSavedReports(organizationId: string) {
  return tenantDb.savedReport.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });
}

export async function saveReport(
  organizationId: string,
  input: { name: string; config: unknown; createdByUserId?: string | null },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the report a name.");
  return tenantDb.savedReport.create({
    data: {
      organizationId,
      name,
      config: input.config as Prisma.InputJsonValue,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function deleteSavedReport(organizationId: string, reportId: string) {
  const result = await tenantDb.savedReport.deleteMany({ where: { id: reportId, organizationId } });
  return result.count > 0;
}
