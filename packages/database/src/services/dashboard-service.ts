import { Prisma } from "@prisma/client";
import { tenantDb } from "../client";
import { validateDashboardConfig, type DashboardConfig } from "../dashboard/config";

/**
 * Per-user dashboard layout (docs/domain/reports.md): pinned-report order and
 * hidden sections, one row per member per org. Purely presentational — reading
 * or writing a layout never widens what the viewer can see, so the only gate is
 * being a member of the organization (the session layer guarantees that before
 * any service call).
 */

export async function getDashboardConfig(organizationId: string, userId: string): Promise<DashboardConfig> {
  const row = await tenantDb.dashboardPreference.findFirst({ where: { organizationId, userId } });
  return validateDashboardConfig(row?.config);
}

export async function saveDashboardConfig(
  organizationId: string,
  userId: string,
  input: unknown,
): Promise<DashboardConfig> {
  const config = validateDashboardConfig(input);
  const existing = await tenantDb.dashboardPreference.findFirst({
    where: { organizationId, userId },
    select: { id: true },
  });
  if (existing) {
    await tenantDb.dashboardPreference.updateMany({
      where: { id: existing.id, organizationId },
      data: { config: config as unknown as Prisma.InputJsonValue },
    });
  } else {
    await tenantDb.dashboardPreference.create({
      data: { organizationId, userId, config: config as unknown as Prisma.InputJsonValue },
    });
  }
  return config;
}
