import { History } from "lucide-react";
import { auditService } from "@cms/database";
import { AuditLogList } from "../../../components/AuditLogList";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { getCurrentOrganization } from "../../../lib/session";

const EVENT_LIMIT = 200;

export default async function AuditLogPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const events = await auditService.listAuditEvents(organization.id, EVENT_LIMIT);
  const rows = events.map((e) => ({
    id: e.id,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: e.metadata,
    createdAt: e.createdAt,
    actorName: e.actor?.name || e.actor?.email || "System",
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Audit log</h1>
      <p className="mb-8 text-sm text-ink-secondary">
        A history of who did what in {organization.name} -- the most recent {EVENT_LIMIT} events.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          bare={false}
          icon={<History size={28} strokeWidth={1.5} />}
          title="No activity yet"
          description="Actions across your organization -- resources approved, teammates invited, settings changed -- will show up here."
        />
      ) : (
        <Card padding="md">
          <AuditLogList events={rows} />
        </Card>
      )}
    </div>
  );
}
