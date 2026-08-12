import { Lock } from "lucide-react";
import { campusService, eventService, givingService, peopleService, reportingService } from "@cms/database";
import { ReportBuilder, type SavedReportItem } from "../../../components/ReportBuilder";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { canPeople } from "../../../lib/people-access";
import { canCheckin } from "../../../lib/checkin-access";
import { canGiving } from "../../../lib/giving-access";
import { canMessages } from "../../../lib/messages-access";
import { aiReportsAvailable } from "../../../lib/ai/report-assistant";
import { getCurrentOrganization } from "../../../lib/session";
import type { ReportSource } from "@cms/database";

/**
 * Report builder (docs/domain/reports.md). The page only assembles option lists
 * the viewer is allowed to see; every run re-checks permissions server-side in
 * runReportAction.
 */
export default async function ReportsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [peopleOk, attendanceOk, givingOk, emailOk] = await Promise.all([
    canPeople(organization.id, "person.view"),
    canCheckin(organization.id, "attendance.view"),
    canGiving(organization.id, "giving.view"),
    canMessages(organization.id, "message.manage"),
  ]);
  const allowedSources = [
    ...(peopleOk ? (["people"] as ReportSource[]) : []),
    ...(attendanceOk ? (["attendance"] as ReportSource[]) : []),
    ...(givingOk ? (["giving"] as ReportSource[]) : []),
  ];

  if (allowedSources.length === 0) {
    return (
      <div>
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Reports</h1>
        <Card padding="md" className="mt-6">
          <EmptyState icon={<Lock size={22} />} title="You don't have access to any report sources" description="" />
        </Card>
      </div>
    );
  }

  const [campuses, funds, events, fieldDefs, saved] = await Promise.all([
    campusService.listCampuses(organization.id),
    givingOk ? givingService.listFunds(organization.id, { includeArchived: true }) : Promise.resolve([]),
    attendanceOk ? eventService.listEvents(organization.id) : Promise.resolve([]),
    peopleOk ? peopleService.listFieldDefinitions(organization.id) : Promise.resolve([]),
    reportingService.listSavedReports(organization.id),
  ]);

  return (
    <div>
      <div className="mb-6 print:mb-3">
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Reports</h1>
        <p className="text-sm text-ink-secondary print:hidden">
          Any combination of attendance, people fields, and giving over any date range — chart it, save it, or
          download it as a PDF.
        </p>
      </div>

      <ReportBuilder
        allowedSources={allowedSources}
        campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
        funds={funds.map((f) => ({ id: f.id, name: f.name }))}
        events={events.map((e) => ({ id: e.id, name: e.title }))}
        customFields={fieldDefs.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))}
        savedReports={saved.map((s): SavedReportItem => ({ id: s.id, name: s.name, config: s.config, pinned: s.pinned }))}
        aiAvailable={aiReportsAvailable()}
        canEmail={emailOk}
      />
    </div>
  );
}
