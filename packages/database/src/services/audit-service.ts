import { tenantDb } from "../client";

export async function recordAuditEvent(params: {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  return tenantDb.auditLog.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ?? undefined,
    },
  });
}

/**
 * Includes the actor so the viewer can show "who" without a second round trip per
 * row -- actorUserId is nullable (system/cron-triggered events like source.synced
 * have no actor), so `actor` comes back null for those rather than throwing.
 */
export async function listAuditEvents(organizationId: string, limit = 50) {
  return tenantDb.auditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true, email: true } } },
  });
}
